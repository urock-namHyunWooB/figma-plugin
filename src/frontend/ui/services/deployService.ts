import {
  getBaseSha,
  createBranch,
  commitFile,
  getFileContent,
  createPullRequest,
} from "./GitHubAPI";

export type DeployStatus =
  | { step: "idle" }
  | { step: "creating-branch"; message: string }
  | { step: "committing"; message: string }
  | { step: "creating-pr"; message: string }
  | { step: "done"; prUrl: string }
  | { step: "error"; message: string };

const COMPONENTS_DIR = "packages/react/src/components";
const INDEX_PATH = "packages/react/src/index.ts";

/**
 * 컴파일된 컴포넌트를 GitHub에 PR로 배포
 */
export async function deployComponent(
  componentName: string,
  compiledCode: string,
  onStatus: (status: DeployStatus) => void
): Promise<void> {
  try {
    const safeName = componentName.replace(/\s+/g, "");
    const branchName = `design/${safeName}-${Date.now().toString(36)}`;
    const filePath = `${COMPONENTS_DIR}/${safeName}.tsx`;

    // 1. base SHA 가져오기 + 브랜치 생성
    onStatus({ step: "creating-branch", message: "브랜치 생성 중..." });
    const baseSha = await getBaseSha();
    await createBranch(branchName, baseSha);

    // 2. 컴포넌트 파일 커밋
    onStatus({ step: "committing", message: `${safeName}.tsx 커밋 중...` });
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
      // 초기 상태: placeholder 교체
      newIndex = exportLine + "\n";
    } else if (currentIndex.includes(exportLine)) {
      // 이미 export 있음: 그대로
      newIndex = currentIndex;
    } else {
      // 새 export 추가
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

    // 4. PR 생성
    onStatus({ step: "creating-pr", message: "PR 생성 중..." });
    const prUrl = await createPullRequest(
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

    onStatus({ step: "done", prUrl });
  } catch (e) {
    onStatus({ step: "error", message: (e as Error).message });
  }
}
