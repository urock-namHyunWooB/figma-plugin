import {
  getBaseSha,
  createBranch,
  commitFiles,
  createPullRequest,
  findComponentPR,
  findAllComponentPRs,
  findReleasePR,
  mergePR,
  deleteBranch,
  getCommitCheckStatusDetail,
  getComponentCIStatus,
  getLatestCIStatus,
  getFileNodeId,
  COMPONENT_BRANCH_PREFIX,
  ACTIONS_URL,
  type OpenPR,
} from "./GitHubAPI";

export type DeployStatus =
  | { step: "idle" }
  | { step: "checking-pr"; message: string }
  | { step: "creating-branch"; message: string }
  | { step: "committing"; message: string }
  | { step: "creating-pr"; message: string }
  | { step: "waiting-ci"; message: string }
  | { step: "done"; prUrl: string; message?: string }
  | { step: "checking-ci"; message: string }
  | { step: "merging"; message: string }
  | { step: "waiting-release"; message: string }
  | { step: "release-done"; message: string }
  | { step: "error"; message: string };

interface PackageTarget {
  componentsDir: string;
  tokensPath: string;
  label: string;
}

const PACKAGES: PackageTarget[] = [
  { componentsDir: "packages/react/src/components", tokensPath: "packages/react/tokens.css", label: "Emotion" },
  { componentsDir: "packages/react-tailwind/src/components", tokensPath: "packages/react-tailwind/tokens.css", label: "Tailwind" },
];

/**
 * 컴파일된 컴포넌트를 컴포넌트별 독립 브랜치에 배포 (Emotion + Tailwind 동시)
 *
 * - 기존 PR이 있으면 기존 브랜치에 커밋 누적
 * - 없으면 새 브랜치 + PR 생성
 * - D2/D3: 이름 충돌 시 node ID로 소유권 검증
 * - D8: 커밋 후 브랜치 유효성 검증
 * - barrel export는 커밋하지 않음 (릴리즈 시 자동 생성)
 */
export async function deployComponent(
  componentName: string,
  compiledCodes: { emotion: string; tailwind: string },
  figmaNodeId: string,
  onStatus: (status: DeployStatus) => void,
  tokensCss?: string
): Promise<void> {
  try {
    const safeName = componentName.replace(/\s+/g, "");
    const branchName = `${COMPONENT_BRANCH_PREFIX}${safeName}`;
    const codeByLabel: Record<string, string> = {
      Emotion: compiledCodes.emotion,
      Tailwind: compiledCodes.tailwind,
    };

    // 1. 기존 컴포넌트 PR 확인
    onStatus({ step: "checking-pr", message: `${safeName} PR 확인 중...` });
    const existingPR = await findComponentPR(safeName);

    // D2/D3: 이름 충돌 검증
    const checkBranch = existingPR ? branchName : "main";
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
      // 새 브랜치 생성 (이전 릴리즈에서 잔여 브랜치가 있으면 삭제 후 재생성)
      onStatus({ step: "creating-branch", message: `${branchName} 브랜치 생성 중...` });
      await deleteBranch(branchName).catch(() => {});
      const baseSha = await getBaseSha();
      await createBranch(branchName, baseSha);
    }

    // 2. Emotion + Tailwind 파일을 하나의 커밋으로 배포 (동일 내용 스킵)
    onStatus({ step: "committing", message: `${safeName}.tsx 커밋 중...` });

    const files = PACKAGES.map((pkg) => ({
      path: `${pkg.componentsDir}/${safeName}.tsx`,
      content: `// @figma-node-id ${figmaNodeId}\n${codeByLabel[pkg.label]}`,
    }));

    // 디자인 토큰 CSS도 atomic commit에 포함
    if (tokensCss) {
      for (const pkg of PACKAGES) {
        files.push({ path: pkg.tokensPath, content: tokensCss });
      }
    }

    const lastCommitSha = await commitFiles(
      branchName,
      files,
      `feat: update ${safeName} component`
    );

    // 코드 변경 없으면 바로 완료 (CI 불필요)
    if (!lastCommitSha) {
      onStatus({ step: "done", prUrl, message: "이미 최신 상태입니다." });
      return;
    }

    // 3. PR 생성 (새 브랜치일 때만)
    if (!existingPR) {
      onStatus({ step: "creating-pr", message: `${safeName} PR 생성 중...` });
      prUrl = await createPullRequest(
        branchName,
        `feat: add ${safeName} component`,
        `## ${safeName}\n\n> Auto-generated from Figma plugin\n> Figma Node ID: ${figmaNodeId}`
      );
    }

    // 5. CI 빌드 대기 — lastCommitSha로 직접 체크 (PR head.sha stale 방지)
    onStatus({ step: "waiting-ci", message: "CI 빌드 대기 중..." });
    const ciResult = await pollCIStatus(lastCommitSha, onStatus);
    if (ciResult === "failure") {
      const ciDetail = await getComponentCIStatus(safeName);
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

    onStatus({ step: "done", prUrl });
  } catch (e) {
    onStatus({ step: "error", message: (e as Error).message });
  }
}

/**
 * CI 상태를 5초 간격으로 폴링 (최대 5분)
 * commitSha를 직접 받아서 PR API의 stale head.sha 문제를 방지
 */
async function pollCIStatus(
  commitSha: string,
  onStatus: (status: DeployStatus) => void
): Promise<"success" | "failure" | "pending"> {
  const MAX_WAIT = 300_000;
  const INTERVAL = 5_000;
  const NO_CI_TIMEOUT = 30_000;
  const start = Date.now();

  await sleep(INTERVAL);

  while (Date.now() - start < MAX_WAIT) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    onStatus({ step: "waiting-ci", message: `CI 빌드 확인 중... (${elapsed}초)` });

    const result = await getCommitCheckStatusDetail(commitSha);
    if (result.status === "success" || result.status === "failure") {
      return result.status;
    }

    if (result.totalRuns === 0 && Date.now() - start > NO_CI_TIMEOUT) {
      return "success";
    }

    await sleep(INTERVAL);
  }

  return "success";
}

/**
 * 릴리즈 실행
 *
 * ① 모든 컴포넌트 PR의 CI 상태 확인
 * ② CI 통과한 PR만 main에 머지 + 브랜치 삭제
 * ③ 릴리즈 PR 폴링 (10초 간격, 최대 180초)
 * ④ 릴리즈 PR 머지 → npm publish 트리거
 */
export async function releaseComponent(
  onStatus: (status: DeployStatus) => void
): Promise<void> {
  try {
    // 1. 모든 컴포넌트 PR 검색
    onStatus({ step: "checking-pr", message: "컴포넌트 PR 검색 중..." });
    const componentPRs = await findAllComponentPRs();

    if (componentPRs.length === 0) {
      onStatus({ step: "error", message: "배포된 컴포넌트 PR이 없습니다. 먼저 Deploy하세요." });
      return;
    }

    // 2. 각 PR의 CI 상태 확인 → 통과한 것만 머지
    onStatus({ step: "checking-ci", message: `${componentPRs.length}개 PR의 CI 상태 확인 중...` });

    const mergeable: OpenPR[] = [];
    const pendingNames: string[] = [];
    const failedNames: string[] = [];

    for (const pr of componentPRs) {
      const ciStatus = await getLatestCIStatus(pr);
      const name = pr.head.ref.replace(COMPONENT_BRANCH_PREFIX, "");
      if (ciStatus === "success") {
        mergeable.push(pr);
      } else if (ciStatus === "pending") {
        pendingNames.push(name);
      } else {
        failedNames.push(name);
      }
    }

    if (mergeable.length === 0) {
      if (pendingNames.length > 0) {
        onStatus({
          step: "error",
          message: `CI 실행 중인 PR이 있습니다: ${pendingNames.join(", ")}. CI 완료 후 다시 시도하세요.`,
        });
      } else {
        onStatus({
          step: "error",
          message: `CI 통과한 PR이 없습니다: ${failedNames.join(", ")}\n${ACTIONS_URL}`,
        });
      }
      return;
    }

    // 3. 기존 릴리즈 PR 확인 (업데이트 감지용)
    const preExisting = await findReleasePR();

    // 4. CI 통과한 PR들 머지 + 브랜치 삭제
    for (const pr of mergeable) {
      const name = pr.head.ref.replace(COMPONENT_BRANCH_PREFIX, "");
      onStatus({ step: "merging", message: `${name} PR #${pr.number} 머지 중...` });
      await mergePR(pr.number);
      await deleteBranch(pr.head.ref).catch(() => {});
    }

    const skippedAll = [...pendingNames.map(n => `${n} (CI 실행 중)`), ...failedNames.map(n => `${n} (CI 실패)`)];
    if (skippedAll.length > 0) {
      onStatus({ step: "merging", message: `${mergeable.length}개 머지 완료. 스킵: ${skippedAll.join(", ")}` });
    }

    // 5. 릴리즈 PR 폴링
    onStatus({ step: "waiting-release", message: "릴리즈 PR 생성 대기 중..." });
    const releasePR = await pollForReleasePR(preExisting, onStatus);

    if (!releasePR) {
      onStatus({
        step: "error",
        message: `릴리즈 PR이 생성되지 않았습니다. GitHub Actions를 확인하세요: ${ACTIONS_URL}`,
      });
      return;
    }

    // 6. 릴리즈 PR CI 대기
    onStatus({ step: "waiting-ci", message: "릴리즈 PR CI 대기 중..." });
    const releaseCIResult = await pollCIStatus(releasePR.head.sha, onStatus);
    if (releaseCIResult === "failure") {
      onStatus({
        step: "error",
        message: `릴리즈 CI 빌드 실패\n${ACTIONS_URL}`,
      });
      return;
    }

    // 7. 릴리즈 PR 머지
    onStatus({ step: "merging", message: `릴리즈 PR #${releasePR.number} 머지 중...` });
    await mergePR(releasePR.number);

    const mergedNames = mergeable.map((pr) => pr.head.ref.replace(COMPONENT_BRANCH_PREFIX, ""));
    onStatus({
      step: "release-done",
      message: `릴리즈 완료! (${mergedNames.join(", ")})`,
    });
  } catch (e) {
    onStatus({ step: "error", message: (e as Error).message });
  }
}

/**
 * 릴리즈 PR이 생성/업데이트될 때까지 폴링
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
