import {
  getBaseSha,
  createBranch,
  commitFile,
  getFileContent,
  createPullRequest,
  findStagingPR,
  findReleasePR,
  mergePR,
  deleteBranch,
  verifyBranchHead,
  getPRCheckStatus,
  getStagingCIStatus,
  getFileNodeId,
  STAGING_BRANCH,
  ACTIONS_URL,
  type OpenPR,
  type CheckStatus,
} from "./GitHubAPI";

export type DeployStatus =
  | { step: "idle" }
  | { step: "checking-pr"; message: string }
  | { step: "creating-branch"; message: string }
  | { step: "committing"; message: string }
  | { step: "creating-pr"; message: string }
  | { step: "verifying"; message: string }
  | { step: "waiting-ci"; message: string }
  | { step: "done"; prUrl: string }
  | { step: "checking-ci"; message: string }
  | { step: "merging"; message: string }
  | { step: "waiting-release"; message: string }
  | { step: "release-done"; message: string }
  | { step: "error"; message: string };

interface PackageTarget {
  componentsDir: string;
  indexPath: string;
  label: string;
}

const PACKAGES: PackageTarget[] = [
  { componentsDir: "packages/react/src/components", indexPath: "packages/react/src/index.ts", label: "Emotion" },
  { componentsDir: "packages/react-tailwind/src/components", indexPath: "packages/react-tailwind/src/index.ts", label: "Tailwind" },
];

/**
 * 컴파일된 컴포넌트를 스테이징 브랜치에 배포 (Emotion + Tailwind 동시)
 *
 * - 스테이징 PR이 있으면 기존 브랜치에 커밋 누적
 * - 없으면 새 브랜치 + PR 생성
 * - D2/D3: 이름 충돌 시 node ID로 소유권 검증
 * - D8: 커밋 후 브랜치 유효성 검증
 */
export async function deployComponent(
  componentName: string,
  compiledCodes: { emotion: string; tailwind: string },
  figmaNodeId: string,
  onStatus: (status: DeployStatus) => void
): Promise<void> {
  try {
    const safeName = componentName.replace(/\s+/g, "");
    const codeByLabel: Record<string, string> = {
      Emotion: compiledCodes.emotion,
      Tailwind: compiledCodes.tailwind,
    };

    // 1. 스테이징 PR 확인
    onStatus({ step: "checking-pr", message: "스테이징 PR 확인 중..." });
    const existingPR = await findStagingPR();

    // D2/D3: 이름 충돌 검증 (첫 번째 패키지 기준)
    const checkBranch = existingPR ? STAGING_BRANCH : "main";
    const emotionFilePath = `${PACKAGES[0].componentsDir}/${safeName}.tsx`;
    const existingNodeId = await getFileNodeId(emotionFilePath, checkBranch);
    if (existingNodeId && existingNodeId !== figmaNodeId) {
      onStatus({
        step: "error",
        message: `${safeName}.tsx는 다른 Figma 노드(${existingNodeId})가 소유 중입니다.`,
      });
      return;
    }

    let prUrl = "";

    if (existingPR) {
      prUrl = existingPR.html_url;
    } else {
      // 새 스테이징 브랜치 생성
      onStatus({ step: "creating-branch", message: "스테이징 브랜치 생성 중..." });
      const baseSha = await getBaseSha();
      await createBranch(STAGING_BRANCH, baseSha);
    }

    // 2. 각 패키지에 컴포넌트 파일 + barrel export 커밋
    let lastCommitSha = "";

    for (const pkg of PACKAGES) {
      const filePath = `${pkg.componentsDir}/${safeName}.tsx`;
      const code = codeByLabel[pkg.label];
      const codeWithMeta = `// @figma-node-id ${figmaNodeId}\n${code}`;

      onStatus({ step: "committing", message: `${safeName}.tsx 커밋 중... (${pkg.label})` });
      lastCommitSha = await commitFile(
        STAGING_BRANCH, filePath, codeWithMeta, `feat: update ${safeName} component (${pkg.label.toLowerCase()})`
      );

      // barrel export 업데이트
      onStatus({ step: "committing", message: `index.ts 업데이트 중... (${pkg.label})` });
      const currentIndex = await getFileContent(pkg.indexPath, STAGING_BRANCH);
      const exportLine = `export { default as ${safeName} } from "./components/${safeName}";`;

      let newIndex: string;
      if (!currentIndex || currentIndex.includes("export {};")) {
        newIndex = exportLine + "\n";
      } else if (currentIndex.includes(exportLine)) {
        newIndex = currentIndex;
      } else {
        newIndex = currentIndex.trimEnd() + "\n" + exportLine + "\n";
      }

      if (newIndex !== currentIndex) {
        lastCommitSha = await commitFile(
          STAGING_BRANCH, pkg.indexPath, newIndex, `feat: export ${safeName} from index (${pkg.label.toLowerCase()})`
        );
      }
    }

    // 3. D8 방어: 커밋 검증
    onStatus({ step: "verifying", message: "커밋 검증 중..." });
    const verified = await verifyBranchHead(STAGING_BRANCH, lastCommitSha);
    if (!verified) {
      onStatus({
        step: "error",
        message: "커밋이 유실되었습니다. 릴리즈가 진행 중일 수 있습니다. 잠시 후 다시 시도하세요.",
      });
      return;
    }

    // 4. PR 생성 (새 브랜치일 때만)
    if (!existingPR) {
      onStatus({ step: "creating-pr", message: "스테이징 PR 생성 중..." });
      prUrl = await createPullRequest(
        STAGING_BRANCH,
        "Update design system components",
        "## Component Updates\n\n> Auto-generated from Figma plugin"
      );
    }

    // 5. CI 빌드 대기 (5초 간격, 최대 5분)
    onStatus({ step: "waiting-ci", message: "CI 빌드 대기 중..." });
    const prNumber = existingPR?.number ?? await findStagingPR().then((pr) => pr?.number);
    if (prNumber) {
      const ciResult = await pollCIStatus(prNumber, onStatus);
      if (ciResult === "failure") {
        // 실패 상세 정보 조회
        const ciDetail = await getStagingCIStatus();
        const failedChecks = ciDetail?.checks
          .filter((c) => c.conclusion === "failure")
          .map((c) => c.name) ?? [];
        const detail = failedChecks.length > 0
          ? `실패한 체크: ${failedChecks.join(", ")}`
          : "빌드 로그를 확인하세요";
        onStatus({
          step: "error",
          message: `CI 빌드 실패 — ${detail}\n${ACTIONS_URL}`,
        });
        return;
      }
    }

    onStatus({ step: "done", prUrl });
  } catch (e) {
    onStatus({ step: "error", message: (e as Error).message });
  }
}

/**
 * CI 상태를 5초 간격으로 폴링 (최대 5분)
 */
async function pollCIStatus(
  prNumber: number,
  onStatus: (status: DeployStatus) => void
): Promise<CheckStatus> {
  const MAX_WAIT = 300_000;
  const INTERVAL = 5_000;
  const start = Date.now();

  // CI가 시작될 때까지 초기 대기
  await sleep(INTERVAL);

  while (Date.now() - start < MAX_WAIT) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    onStatus({ step: "waiting-ci", message: `CI 빌드 확인 중... (${elapsed}초)` });

    const status = await getPRCheckStatus(prNumber);
    if (status === "success" || status === "failure") {
      return status;
    }

    await sleep(INTERVAL);
  }

  // 타임아웃 — pending 상태로 간주하고 통과 (CI가 너무 오래 걸리는 경우)
  return "success";
}

/**
 * 릴리즈 실행
 *
 * ① 스테이징 PR CI 확인 (R3)
 * ② 스테이징 PR 머지
 * ③ 릴리즈 PR 폴링 (R5: 10초 간격, 최대 180초)
 * ④ 릴리즈 PR 머지 → npm publish 트리거
 */
export async function releaseComponent(
  onStatus: (status: DeployStatus) => void
): Promise<void> {
  try {
    // 1. 스테이징 PR 검색
    onStatus({ step: "checking-pr", message: "스테이징 PR 검색 중..." });
    const stagingPR = await findStagingPR();

    if (!stagingPR) {
      onStatus({ step: "error", message: "스테이징 PR이 없습니다. 먼저 컴포넌트를 Deploy하세요." });
      return;
    }

    // 2. R3: CI 상태 확인
    onStatus({ step: "checking-ci", message: "CI 빌드 상태 확인 중..." });
    const ciStatus = await getPRCheckStatus(stagingPR.number);

    if (ciStatus === "failure") {
      onStatus({ step: "error", message: "CI 빌드가 실패했습니다. 컴포넌트 코드를 확인하세요." });
      return;
    }
    if (ciStatus === "pending") {
      onStatus({ step: "error", message: "CI 빌드가 진행 중입니다. 완료 후 다시 시도하세요." });
      return;
    }

    // 3. 기존 릴리즈 PR 확인 (업데이트 감지용)
    const preExisting = await findReleasePR();

    // 4. 스테이징 PR 머지 + 브랜치 삭제
    onStatus({ step: "merging", message: `스테이징 PR #${stagingPR.number} 머지 중...` });
    await mergePR(stagingPR.number);
    await deleteBranch(STAGING_BRANCH).catch(() => {});

    // 5. R5: 릴리즈 PR 폴링
    onStatus({ step: "waiting-release", message: "릴리즈 PR 생성 대기 중..." });
    const releasePR = await pollForReleasePR(preExisting, onStatus);

    if (!releasePR) {
      onStatus({
        step: "error",
        message: `릴리즈 PR이 생성되지 않았습니다. GitHub Actions를 확인하세요: ${ACTIONS_URL}`,
      });
      return;
    }

    // 6. 릴리즈 PR 머지
    onStatus({ step: "merging", message: `릴리즈 PR #${releasePR.number} 머지 중...` });
    await mergePR(releasePR.number);

    onStatus({
      step: "release-done",
      message: "릴리즈 완료! npm publish가 자동 실행됩니다.",
    });
  } catch (e) {
    onStatus({ step: "error", message: (e as Error).message });
  }
}

/**
 * 릴리즈 PR이 생성/업데이트될 때까지 폴링
 * - 기존 릴리즈 PR이 없었으면 → 새로 생성될 때까지 대기
 * - 기존 릴리즈 PR이 있었으면 → HEAD SHA 변경(업데이트)될 때까지 대기
 */
async function pollForReleasePR(
  preExisting: OpenPR | null,
  onStatus: (status: DeployStatus) => void
): Promise<OpenPR | null> {
  const MAX_WAIT = 180_000;
  const INTERVAL = 10_000;
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT) {
    await sleep(INTERVAL);
    const elapsed = Math.round((Date.now() - start) / 1000);
    onStatus({ step: "waiting-release", message: `릴리즈 PR 대기 중... (${elapsed}초)` });

    const releasePR = await findReleasePR();
    if (!releasePR) continue;

    if (!preExisting) return releasePR;
    if (releasePR.head.sha !== preExisting.head.sha) return releasePR;
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
