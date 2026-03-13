const REPO_OWNER = "UROCK-INC";
const REPO_NAME = "design-system";
const BASE_BRANCH = "main";
const API_BASE = "https://api.github.com";

export const STAGING_BRANCH = "design/staging";
export const COMPONENT_BRANCH_PREFIX = "design/components/";
export const ACTIONS_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions`;

/**
 * 플러그인 백엔드를 통한 GitHub API 프록시
 * Figma iframe CSP가 외부 API 직접 호출을 차단하므로,
 * postMessage로 백엔드 sandbox에 fetch를 위임한다.
 */
function pluginFetch(url: string, method: string, body?: string): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const requestId = `gh-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "github-fetch-response" && msg.requestId === requestId) {
        window.removeEventListener("message", handler);
        resolve({ ok: msg.ok, status: msg.status, body: msg.body });
      }
    };

    window.addEventListener("message", handler);

    setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("GitHub API 요청 타임아웃 (30s)"));
    }, 30000);

    parent.postMessage({
      pluginMessage: {
        type: "github-fetch-request",
        requestId,
        url,
        method,
        body,
      },
    }, "*");
  });
}

async function api<T>(path: string, options?: { method?: string; body?: string }): Promise<T> {
  const res = await pluginFetch(
    `${API_BASE}${path}`,
    options?.method || "GET",
    options?.body
  );
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.body}`);
  }
  return JSON.parse(res.body);
}

/** main 브랜치의 최신 SHA 가져오기 */
export async function getBaseSha(): Promise<string> {
  const ref = await api<{ object: { sha: string } }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${BASE_BRANCH}`
  );
  return ref.object.sha;
}

/** 새 브랜치 생성 */
export async function createBranch(branchName: string, sha: string): Promise<void> {
  await api(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha,
    }),
  });
}

/** 여러 파일을 하나의 커밋으로 묶어 push — Git Trees API 사용 */
export async function commitFiles(
  branchName: string,
  files: Array<{ path: string; content: string }>,
  message: string
): Promise<string | null> {
  // 1. 브랜치 HEAD SHA 가져오기
  const ref = await api<{ object: { sha: string } }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${branchName}`
  );
  const baseCommitSha = ref.object.sha;

  // 2. 기존 파일과 비교 — 변경된 파일만 추림
  const changedFiles: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    const existing = await getFileContent(file.path, branchName);
    if (existing !== file.content) {
      changedFiles.push(file);
    }
  }

  // 모든 파일 동일 → 커밋 불필요
  if (changedFiles.length === 0) {
    return null;
  }

  // 3. 각 파일의 blob 생성
  const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  for (const file of changedFiles) {
    const blob = await api<{ sha: string }>(
      `/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`,
      {
        method: "POST",
        body: JSON.stringify({
          content: file.content,
          encoding: "utf-8",
        }),
      }
    );
    treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  // 4. Tree 생성 (base_tree로 기존 파일 유지)
  const baseCommit = await api<{ tree: { sha: string } }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${baseCommitSha}`
  );
  const tree = await api<{ sha: string }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: treeItems,
      }),
    }
  );

  // 5. Commit 생성
  const commit = await api<{ sha: string }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [baseCommitSha],
      }),
    }
  );

  // 6. 브랜치 ref 업데이트
  await api(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${branchName}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });

  return commit.sha;
}

/** 파일 내용 읽기 (base64 디코딩) */
export async function getFileContent(filePath: string, branch: string = BASE_BRANCH): Promise<string | null> {
  try {
    const file = await api<{ content: string }>(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${branch}`
    );
    return decodeURIComponent(escape(atob(file.content.replace(/\n/g, ""))));
  } catch {
    return null;
  }
}

/** PR 생성 */
export async function createPullRequest(
  branchName: string,
  title: string,
  body: string
): Promise<string> {
  const pr = await api<{ html_url: string }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        head: branchName,
        base: BASE_BRANCH,
      }),
    }
  );
  return pr.html_url;
}

/** PR 검색 결과 */
export interface OpenPR {
  number: number;
  html_url: string;
  head: { ref: string; sha: string };
}

/** 스테이징 PR 검색 (design/staging 브랜치 exact match) */
export async function findStagingPR(): Promise<OpenPR | null> {
  const prs = await api<OpenPR[]>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open`
  );
  return prs.find((pr) => pr.head.ref === STAGING_BRANCH) ?? null;
}

/** 컴포넌트별 PR 검색 (design/components/{name} 브랜치) */
export async function findComponentPR(componentName: string): Promise<OpenPR | null> {
  const branch = `${COMPONENT_BRANCH_PREFIX}${componentName}`;
  const prs = await api<OpenPR[]>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&head=${REPO_OWNER}:${branch}`
  );
  return prs[0] ?? null;
}

/** 모든 컴포넌트 PR 검색 (design/components/* 브랜치) */
export async function findAllComponentPRs(): Promise<OpenPR[]> {
  const prs = await api<OpenPR[]>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open`
  );
  return prs.filter((pr) => pr.head.ref.startsWith(COMPONENT_BRANCH_PREFIX));
}

/** release-please 릴리즈 PR 검색 */
export async function findReleasePR(): Promise<OpenPR | null> {
  const prs = await api<OpenPR[]>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open`
  );
  return prs.find((pr) =>
    pr.head.ref.startsWith("release-please--branches--main")
  ) ?? null;
}

/** PR 머지 — 머지 후 상태 검증 */
export async function mergePR(prNumber: number): Promise<void> {
  await api(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "merge" }),
  });

  // 머지 검증
  const pr = await api<{ merged: boolean; state: string }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`
  );
  if (!pr.merged) {
    throw new Error(`PR #${prNumber} 머지 실패 (state: ${pr.state})`);
  }
}

/** PR 닫기 (머지 없이) */
export async function closePR(prNumber: number): Promise<void> {
  await api(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

/** 브랜치 삭제 */
export async function deleteBranch(branchName: string): Promise<void> {
  await api(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${branchName}`, {
    method: "DELETE",
  });
}


/** PR의 CI 체크 상태 조회 (R3) */
export type CheckStatus = "success" | "failure" | "pending";

export async function getPRCheckStatus(prNumber: number): Promise<CheckStatus> {
  const result = await getPRCheckStatusDetail(prNumber);
  return result.status;
}

/** PR의 CI 체크 상태 + run 개수 조회 */
export async function getPRCheckStatusDetail(prNumber: number): Promise<{ status: CheckStatus; totalRuns: number }> {
  const pr = await api<{ head: { sha: string } }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`
  );
  return getCommitCheckStatusDetail(pr.head.sha);
}

/** 특정 커밋의 CI 체크 상태 조회 (PR API 경유하지 않음 — stale head.sha 방지) */
export async function getCommitCheckStatusDetail(commitSha: string): Promise<{ status: CheckStatus; totalRuns: number }> {
  const checks = await api<{ check_runs: Array<{ status: string; conclusion: string | null }> }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/commits/${commitSha}/check-runs`
  );

  const totalRuns = checks.check_runs.length;

  if (totalRuns === 0) return { status: "pending", totalRuns: 0 };

  if (checks.check_runs.some((r) => r.status === "completed" && r.conclusion === "failure")) {
    return { status: "failure", totalRuns };
  }
  if (checks.check_runs.every((r) => r.status === "completed")) {
    return { status: "success", totalRuns };
  }
  return { status: "pending", totalRuns };
}

/**
 * PR 브랜치에서 check run이 존재하는 가장 최신 커밋의 CI 결과 반환
 * 동일 코드 재배포로 check run 0개인 커밋이 쌓여도 정확한 CI 상태를 얻는다.
 */
export async function getLatestCIStatus(pr: OpenPR): Promise<CheckStatus> {
  // GitHub PR commits API는 오래된 순 반환 — per_page=100으로 최대한 가져옴
  const commits = await api<Array<{ sha: string }>>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pr.number}/commits?per_page=100`
  );

  // 최신 커밋부터 역순 탐색
  for (let i = commits.length - 1; i >= 0; i--) {
    const result = await getCommitCheckStatusDetail(commits[i].sha);
    if (result.totalRuns > 0) {
      return result.status;
    }
  }

  // 모든 커밋에 check run 없음 → pending
  return "pending";
}

/** 스테이징 PR의 개별 체크 런 상태 조회 */
export interface CheckRun {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;
  html_url: string;
}

export interface ComponentCIStatus {
  pr: OpenPR;
  componentName: string;
  checks: CheckRun[];
  overall: CheckStatus;
}

/** 특정 컴포넌트 PR의 CI 상태 조회 */
export async function getComponentCIStatus(componentName: string): Promise<ComponentCIStatus | null> {
  const pr = await findComponentPR(componentName);
  if (!pr) return null;

  return getPRCIDetail(pr, componentName);
}

/** 모든 컴포넌트 PR의 CI 상태 조회 */
export async function getAllComponentCIStatus(): Promise<ComponentCIStatus[]> {
  const prs = await findAllComponentPRs();
  return Promise.all(
    prs.map((pr) => {
      const name = pr.head.ref.replace(COMPONENT_BRANCH_PREFIX, "");
      return getPRCIDetail(pr, name);
    })
  );
}

async function getPRCIDetail(pr: OpenPR, componentName: string): Promise<ComponentCIStatus> {
  const result = await api<{ check_runs: Array<{ name: string; status: string; conclusion: string | null; html_url: string }> }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/commits/${pr.head.sha}/check-runs`
  );

  const checks: CheckRun[] = result.check_runs.map((r) => ({
    name: r.name,
    status: r.status as CheckRun["status"],
    conclusion: r.conclusion as CheckRun["conclusion"],
    html_url: r.html_url,
  }));

  let overall: CheckStatus = "pending";
  if (checks.length > 0) {
    if (checks.some((r) => r.status === "completed" && r.conclusion === "failure")) {
      overall = "failure";
    } else if (checks.every((r) => r.status === "completed")) {
      overall = "success";
    }
  }

  return { pr, componentName, checks, overall };
}

/** 파일에서 @figma-node-id 메타데이터 추출 (D2/D3) */
export async function getFileNodeId(filePath: string, branch: string): Promise<string | null> {
  const content = await getFileContent(filePath, branch);
  if (!content) return null;
  const match = content.match(/\/\/ @figma-node-id (.+)/);
  return match?.[1]?.trim() ?? null;
}
