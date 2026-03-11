const REPO_OWNER = "UROCK-INC";
const REPO_NAME = "design-system";
const BASE_BRANCH = "main";
const API_BASE = "https://api.github.com";

function getToken(): string {
  const token = import.meta.env.VITE_GITHUB_TOKEN;
  if (!token) throw new Error("VITE_GITHUB_TOKEN이 설정되지 않았습니다. .env 파일을 확인하세요.");
  return token;
}

function headers() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers(), ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }
  return res.json();
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

/** 파일 생성 또는 업데이트 (단일 파일) */
export async function commitFile(
  branchName: string,
  filePath: string,
  content: string,
  message: string
): Promise<void> {
  // 기존 파일 SHA 확인 (업데이트 시 필요)
  let existingSha: string | undefined;
  try {
    const existing = await api<{ sha: string }>(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${branchName}`
    );
    existingSha = existing.sha;
  } catch {
    // 파일이 없으면 새로 생성
  }

  await api(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: branchName,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
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
