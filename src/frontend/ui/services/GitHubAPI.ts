const REPO_OWNER = "UROCK-INC";
const REPO_NAME = "design-system";
const BASE_BRANCH = "main";
const API_BASE = "https://api.github.com";

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

    // 10초 타임아웃
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

/** 열린 PR 검색 결과 */
export interface OpenPR {
  number: number;
  html_url: string;
  head: { ref: string };
}

/**
 * 해당 컴포넌트의 열린 PR 검색
 * 브랜치명이 `design/${componentName}`으로 시작하는 PR을 찾는다.
 */
export async function findOpenPR(componentName: string): Promise<OpenPR | null> {
  const safeName = componentName.replace(/\s+/g, "");
  const prs = await api<OpenPR[]>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open`
  );
  const match = prs.find((pr) => pr.head.ref.startsWith(`design/${safeName}-`));
  return match ?? null;
}

/**
 * release-please가 생성한 릴리즈 PR 검색
 * 브랜치명이 `release-please--branches--main`으로 시작하는 열린 PR을 찾는다.
 */
export async function findReleasePR(): Promise<OpenPR | null> {
  const prs = await api<OpenPR[]>(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open`
  );
  const match = prs.find((pr) =>
    pr.head.ref.startsWith("release-please--branches--main")
  );
  return match ?? null;
}

/** PR을 merge 방식으로 머지 */
export async function mergePR(prNumber: number): Promise<void> {
  await api(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "merge" }),
  });
}
