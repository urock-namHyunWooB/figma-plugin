import {
  getBaseSha,
  createBranch,
  commitFile,
  getFileContent,
  createPullRequest,
  findOpenPR,
  findReleasePR,
  mergePR,
} from "./GitHubAPI";

export type DeployStatus =
  | { step: "idle" }
  | { step: "checking-pr"; message: string }
  | { step: "creating-branch"; message: string }
  | { step: "committing"; message: string }
  | { step: "creating-pr"; message: string }
  | { step: "done"; prUrl: string }
  | { step: "merging"; message: string }
  | { step: "release-done"; message: string }
  | { step: "error"; message: string };

const COMPONENTS_DIR = "packages/react/src/components";
const INDEX_PATH = "packages/react/src/index.ts";

/**
 * 컴파일된 컴포넌트를 GitHub에 PR로 배포
 * - 같은 컴포넌트의 열린 PR이 있으면 기존 브랜치에 커밋 업데이트
 * - 없으면 새 브랜치 + 새 PR 생성
 */
export async function deployComponent(
  componentName: string,
  compiledCode: string,
  onStatus: (status: DeployStatus) => void
): Promise<void> {
  try {
    const safeName = componentName.replace(/\s+/g, "");
    const filePath = `${COMPONENTS_DIR}/${safeName}.tsx`;

    // 1. 기존 열린 PR 검색
    onStatus({ step: "checking-pr", message: "기존 PR 확인 중..." });
    const existingPR = await findOpenPR(componentName);

    let branchName: string;
    let prUrl: string;

    if (existingPR) {
      // 기존 PR이 있으면 해당 브랜치에 커밋 업데이트
      branchName = existingPR.head.ref;
      prUrl = existingPR.html_url;

      onStatus({ step: "committing", message: `${safeName}.tsx 업데이트 중... (기존 PR #${existingPR.number})` });
    } else {
      // 새 브랜치 생성
      branchName = `design/${safeName}-${Date.now().toString(36)}`;

      onStatus({ step: "creating-branch", message: "브랜치 생성 중..." });
      const baseSha = await getBaseSha();
      await createBranch(branchName, baseSha);

      onStatus({ step: "committing", message: `${safeName}.tsx 커밋 중...` });
    }

    // 2. 컴포넌트 파일 커밋
    await commitFile(
      branchName,
      filePath,
      compiledCode,
      `feat: update ${safeName} component`
    );

    // 3. barrel export 업데이트
    onStatus({ step: "committing", message: "index.ts 업데이트 중..." });
    const currentIndex = await getFileContent(INDEX_PATH, branchName);
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
      await commitFile(
        branchName,
        INDEX_PATH,
        newIndex,
        `feat: export ${safeName} from index`
      );
    }

    // 4. PR 생성 (기존 PR이 없을 때만)
    if (!existingPR) {
      onStatus({ step: "creating-pr", message: "PR 생성 중..." });
      prUrl = await createPullRequest(
        branchName,
        `Update ${safeName} component`,
        [
          `## Component Update`,
          ``,
          `- **Component**: \`${safeName}\``,
          `- **File**: \`${filePath}\``,
          ``,
          `> Auto-generated from Figma plugin`,
        ].join("\n")
      );
    }

    onStatus({ step: "done", prUrl: prUrl! });
  } catch (e) {
    onStatus({ step: "error", message: (e as Error).message });
  }
}

/**
 * 릴리즈 PR을 찾아서 머지
 * release-please가 생성한 PR을 머지하면 GitHub Actions가 npm publish를 트리거한다.
 */
export async function releaseComponent(
  onStatus: (status: DeployStatus) => void
): Promise<void> {
  try {
    onStatus({ step: "checking-pr", message: "릴리즈 PR 검색 중..." });
    const releasePR = await findReleasePR();

    if (!releasePR) {
      onStatus({ step: "error", message: "릴리즈 PR이 없습니다. 먼저 컴포넌트를 Deploy하세요." });
      return;
    }

    onStatus({ step: "merging", message: `릴리즈 PR #${releasePR.number} 머지 중...` });
    await mergePR(releasePR.number);

    onStatus({
      step: "release-done",
      message: `릴리즈 PR #${releasePR.number} 머지 완료. npm publish가 자동 실행됩니다.`,
    });
  } catch (e) {
    onStatus({ step: "error", message: (e as Error).message });
  }
}
