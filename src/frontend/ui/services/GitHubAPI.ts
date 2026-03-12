const REPO_OWNER = "UROCK-INC";
const REPO_NAME = "design-system";
const BASE_BRANCH = "main";
const API_BASE = "https://api.github.com";

export const STAGING_BRANCH = "design/staging";
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
      reject(new Error("GitHub API 요청 타임아웃 (10s)"));
    }, 10000);

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

/** 파일 생성 또는 업데이트 — 커밋 SHA 반환 */
export async function commitFile(
  branchName: string,
  filePath: string,
  content: string,
  message: string
): Promise<string> {
  let existingSha: string | undefined;
  try {
    const existing = await api<{ sha: string }>(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${branchName}`
    );
    existingSha = existing.sha;
  } catch {
    // 파일이 없으면 새로 생성
  }

  const result = await api<{ commit: { sha: string } }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: btoa(unescape(encodeURIComponent(content))),
        branch: branchName,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    }
  );
  return result.commit.sha;
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

/** release-please 릴리즈 PR 검색 */
export async function findReleasePR(): Promise<OpenPR | null> {
  const prs = await api<OpenPR[]>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open`
  );
  return prs.find((pr) =>
    pr.head.ref.startsWith("release-please--branches--main")
  ) ?? null;
}

/** PR 머지 */
export async function mergePR(prNumber: number): Promise<void> {
  await api(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "merge" }),
  });
}

/** 브랜치 삭제 */
export async function deleteBranch(branchName: string): Promise<void> {
  await api(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${branchName}`, {
    method: "DELETE",
  });
}

/** 브랜치 HEAD가 특정 커밋인지 검증 (D8 방어) */
export async function verifyBranchHead(branchName: string, expectedSha: string): Promise<boolean> {
  try {
    const ref = await api<{ object: { sha: string } }>(
      `/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${branchName}`
    );
    return ref.object.sha === expectedSha;
  } catch {
    return false;
  }
}

/** PR의 CI 체크 상태 조회 (R3) */
export type CheckStatus = "success" | "failure" | "pending";

export async function getPRCheckStatus(prNumber: number): Promise<CheckStatus> {
  const pr = await api<{ head: { sha: string } }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`
  );

  const checks = await api<{ check_runs: Array<{ status: string; conclusion: string | null }> }>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/commits/${pr.head.sha}/check-runs`
  );

  if (checks.check_runs.length === 0) return "pending";

  if (checks.check_runs.some((r) => r.status === "completed" && r.conclusion === "failure")) {
    return "failure";
  }
  if (checks.check_runs.every((r) => r.status === "completed")) {
    return "success";
  }
  return "pending";
}

/** 스테이징 PR의 개별 체크 런 상태 조회 */
export interface CheckRun {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;
  html_url: string;
}

export interface StagingCIStatus {
  pr: OpenPR;
  checks: CheckRun[];
  overall: CheckStatus;
}

export async function getStagingCIStatus(): Promise<StagingCIStatus | null> {
  const pr = await findStagingPR();
  if (!pr) return null;

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

  return { pr, checks, overall };
}

/** 파일에서 @figma-node-id 메타데이터 추출 (D2/D3) */
export async function getFileNodeId(filePath: string, branch: string): Promise<string | null> {
  const content = await getFileContent(filePath, branch);
  if (!content) return null;
  const match = content.match(/\/\/ @figma-node-id (.+)/);
  return match?.[1]?.trim() ?? null;
}
