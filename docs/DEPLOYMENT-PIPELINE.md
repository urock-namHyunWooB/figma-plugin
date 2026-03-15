# Deployment Pipeline

> 이 문서는 Figma 플러그인에서 디자인 시스템 저장소로의 배포 파이프라인을 설명합니다.

## Overview

이 플러그인은 Figma에서 생성한 React 컴포넌트 코드를 **외부 GitHub 저장소**(`UROCK-INC/design-system`)에 자동 배포합니다. 플러그인 자체에는 GitHub Actions 워크플로우가 없으며, 대상 저장소의 CI/CD를 활용합니다.

### 핵심 특징

- **듀얼 패키지 배포**: Emotion + Tailwind 컴포넌트를 동시에 배포
- **컴포넌트별 독립 브랜치**: 각 컴포넌트가 별도 PR로 관리
- **소유권 검증**: `@figma-node-id` 메타데이터로 이름 충돌 방지
- **CI 연동**: 대상 저장소 CI 결과를 폴링하여 머지 결정
- **release-please 통합**: 자동 버전 관리 및 npm 퍼블리시

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Figma Plugin                             │
│                                                                  │
│  ┌─────────────┐     postMessage      ┌─────────────────────┐  │
│  │   UI (React) │ ──────────────────→ │ Plugin Backend       │  │
│  │              │     github-fetch     │ (FigmaPlugin.ts)     │  │
│  │ deployService│ ←────────────────── │                       │  │
│  │ GitHubAPI    │     -response        │ fetch + GITHUB_TOKEN │  │
│  └─────────────┘                      └──────────┬────────────┘  │
│                                                   │               │
└───────────────────────────────────────────────────┼───────────────┘
                                                    │
                                                    ▼
                                          GitHub REST API
                                                    │
                                                    ▼
                                  ┌─────────────────────────────┐
                                  │  UROCK-INC/design-system     │
                                  │                               │
                                  │  branches:                    │
                                  │  ├── main                     │
                                  │  ├── design/components/{Name} │
                                  │  ├── design/tokens            │
                                  │  └── release-please--*        │
                                  │                               │
                                  │  packages:                    │
                                  │  ├── react/src/components/    │
                                  │  ├── react/tokens.css         │
                                  │  ├── react-tailwind/src/...   │
                                  │  └── react-tailwind/tokens.css│
                                  └─────────────────────────────┘
```

### CSP 우회 프록시

Figma iframe의 CSP(Content Security Policy)가 외부 API 직접 호출을 차단합니다.
이를 우회하기 위해 **UI → Plugin Backend → GitHub API** 프록시 패턴을 사용합니다.

```
UI (GitHubAPI.ts)              Plugin Backend (FigmaPlugin.ts)
─────────────────              ─────────────────────────────────
pluginFetch()
  │
  ├── postMessage({ type: "github-fetch-request", url, method, body })
  │                                │
  │                                ▼
  │                          handleGitHubFetch()
  │                            fetch(url, {
  │                              Authorization: Bearer ${GITHUB_TOKEN},
  │                              Accept: application/vnd.github+json
  │                            })
  │                                │
  │                                ▼
  │                          postMessage({ type: "github-fetch-response", ok, status, body })
  │                                │
  ▼                                │
resolve({ ok, status, body }) ←────┘
```

**타임아웃**: 30초 (응답 없으면 reject)

---

## 배포 단계

### Phase 1: Component Deploy (`deployComponent`)

컴파일된 컴포넌트를 컴포넌트별 독립 브랜치에 배포합니다.

```
deployComponent(componentName, { emotion, tailwind }, figmaNodeId)
│
├── 1. 기존 PR 확인 (findComponentPR)
│      branch: design/components/{ComponentName}
│
├── 2. 소유권 검증 (D2/D3)
│      @figma-node-id 메타데이터 비교
│      → 다른 노드가 소유 중이면 에러
│
├── 3. 브랜치 생성 또는 기존 브랜치 사용
│      새 PR: deleteBranch → getBaseSha → createBranch
│      기존 PR: 기존 브랜치에 커밋 누적
│
├── 4. 파일 커밋 (commitFiles)
│      동시 배포 대상:
│      ├── packages/react/src/components/{Name}.tsx          (Emotion)
│      └── packages/react-tailwind/src/components/{Name}.tsx (Tailwind)
│      파일 헤더: // @figma-node-id {nodeId}
│      커밋 메시지: feat: update {Name} component
│      * 내용 동일하면 커밋 스킵 → "이미 최신 상태"
│
├── 5. PR 생성 (새 브랜치일 때만)
│      title: feat: add {Name} component
│
└── 6. CI 빌드 대기 (pollCIStatus)
       lastCommitSha로 직접 체크 (PR head.sha stale 방지)
       → success: 완료
       → failure: 실패한 체크 이름 표시 + Actions URL
```

### Phase 2: Tokens Deploy (`deployTokens`)

디자인 토큰(CSS 변수)을 전용 브랜치에 배포합니다.

```
deployTokens(tokensCss)
│
├── 1. 기존 토큰 PR 확인 (findTokensPR)
│      branch: design/tokens
│
├── 2. 브랜치 생성 또는 기존 브랜치 사용
│
├── 3. 토큰 파일 커밋
│      동시 배포 대상:
│      ├── packages/react/tokens.css
│      └── packages/react-tailwind/tokens.css
│      커밋 메시지: feat: update design tokens
│
└── 4. PR 생성 (새 브랜치일 때만)
       title: feat: update design tokens
```

**토큰 소스**: Figma `boundVariables`에서 COLOR 타입만 추출 → CSS 변수로 변환

### Phase 3: Release (`releaseComponent`)

배포된 PR들을 main에 머지하고 릴리즈를 트리거합니다.

```
releaseComponent()
│
├── 1. PR 수집
│      ├── findAllComponentPRs()  → design/components/* 브랜치
│      └── findTokensPR()         → design/tokens 브랜치
│
├── 2. CI 상태 확인 (getLatestCIStatus per PR)
│      ├── success  → mergeable 목록에 추가
│      ├── pending  → 스킵 (CI 실행 중)
│      └── failure  → 스킵 (CI 실패)
│      * mergeable 0개면 에러
│
├── 3. 기존 릴리즈 PR 확인 (업데이트 감지용)
│
├── 4. CI 통과 PR 머지 + 브랜치 삭제
│      for each mergeable PR:
│        mergePR(pr.number)
│        deleteBranch(pr.head.ref)
│
├── 5. 릴리즈 PR 폴링 (pollForReleasePR)
│      release-please가 생성하는 PR 대기
│      간격: 10초, 최대: 180초
│      기존 PR과 head.sha 비교하여 업데이트 감지
│
├── 6. 릴리즈 PR CI 대기 (pollCIStatus)
│
└── 7. 릴리즈 PR 머지
       → 대상 저장소의 GitHub Actions가 npm publish 트리거
```

---

## CI 폴링 메커니즘

### pollCIStatus

커밋 SHA를 직접 사용하여 CI 상태를 폴링합니다.

| 파라미터 | 값 |
|---------|-----|
| 폴링 간격 | 5초 |
| 최대 대기 | 5분 (300초) |
| CI 미설정 타임아웃 | 30초 |

```typescript
// CI 상태 판단 로직
check_runs.some(failure)        → "failure"
check_runs.every(completed)     → "success"
check_runs.length === 0 && >30s → "success" (CI 미설정)
otherwise                       → "pending"
```

### getLatestCIStatus

동일 코드 재배포 시 check run 0개인 커밋이 쌓이는 문제를 해결합니다.

```
PR의 모든 커밋을 최신순으로 탐색
  │
  ├── check runs > 0인 커밋 발견 → 해당 커밋의 CI 상태 반환
  │
  └── 모든 커밋에 check run 없음 → "success" (CI 미설정)
```

---

## 소유권 검증 (D2/D3)

동일 이름의 컴포넌트가 다른 Figma 노드에서 배포되는 것을 방지합니다.

```
1. 대상 브랜치(기존 PR이면 해당 브랜치, 없으면 main)에서 파일 읽기
2. // @figma-node-id {id} 메타데이터 추출
3. 현재 배포하려는 figmaNodeId와 비교
4. 불일치 → 에러: "{Name}.tsx는 다른 Figma 노드({existingId})가 소유 중입니다."
```

---

## Git Operations (GitHub API)

### commitFiles — Git Trees API

여러 파일을 단일 커밋으로 push합니다. GitHub Contents API 대신 **Git Trees API**를 사용하여 atomic commit을 보장합니다.

```
1. 브랜치 HEAD SHA 조회
2. 기존 파일과 비교 → 변경된 파일만 추림 (normalize + trimEnd)
3. 변경 없으면 null 반환 (커밋 불필요)
4. 각 파일 → blob 생성 (POST /git/blobs)
5. Tree 생성 (POST /git/trees, base_tree로 기존 파일 유지)
6. Commit 생성 (POST /git/commits)
7. 브랜치 ref 업데이트 (PATCH /git/refs/heads/{branch})
8. commit SHA 반환
```

### 주요 API 함수

| 함수 | 역할 |
|------|------|
| `getBaseSha()` | main 브랜치 최신 SHA |
| `createBranch(name, sha)` | 새 브랜치 생성 |
| `commitFiles(branch, files, message)` | 멀티 파일 atomic 커밋 |
| `getFileContent(path, branch)` | 파일 내용 읽기 (base64 디코딩) |
| `createPullRequest(branch, title, body)` | PR 생성 |
| `findComponentPR(name)` | 컴포넌트 PR 검색 |
| `findAllComponentPRs()` | 모든 컴포넌트 PR 검색 |
| `findTokensPR()` | 토큰 PR 검색 |
| `findReleasePR()` | release-please PR 검색 |
| `mergePR(number)` | PR 머지 + 검증 |
| `closePR(number)` | PR 닫기 + 검증 |
| `deleteBranch(name)` | 브랜치 삭제 |
| `getCommitCheckStatusDetail(sha)` | 커밋 CI 상태 조회 |
| `getLatestCIStatus(pr)` | PR의 유효한 최신 CI 상태 |
| `getComponentCIStatus(name)` | 특정 컴포넌트 CI 상세 |
| `getAllComponentCIStatus()` | 모든 컴포넌트 CI 상세 |
| `getFileNodeId(path, branch)` | @figma-node-id 메타데이터 추출 |

---

## 브랜치 전략

```
main (base branch)
│
├── design/components/Button     ← 컴포넌트별 독립 PR
├── design/components/Input      ← 컴포넌트별 독립 PR
├── design/components/Card       ← 컴포넌트별 독립 PR
├── design/tokens                ← 디자인 토큰 전용 PR
│
└── release-please--branches--main  ← release-please 자동 생성
```

- **컴포넌트 브랜치**: `design/components/{ComponentName}`
  - 기존 PR이 있으면 커밋 누적
  - 릴리즈 시 머지 후 삭제
- **토큰 브랜치**: `design/tokens`
  - 컴포넌트와 동일한 PR 패턴
- **릴리즈 브랜치**: `release-please--branches--main`
  - release-please가 자동 생성
  - 머지 시 npm publish 트리거

---

## 대상 저장소 구조

```
UROCK-INC/design-system/
├── packages/
│   ├── react/
│   │   ├── src/components/
│   │   │   ├── Button.tsx          ← Emotion 스타일
│   │   │   ├── Input.tsx
│   │   │   └── ...
│   │   └── tokens.css              ← 디자인 토큰
│   │
│   └── react-tailwind/
│       ├── src/components/
│       │   ├── Button.tsx          ← Tailwind 스타일
│       │   ├── Input.tsx
│       │   └── ...
│       └── tokens.css              ← 디자인 토큰 (동일)
│
└── .github/workflows/             ← CI/CD (대상 저장소에서 관리)
    └── (build, test, release-please, npm publish)
```

---

## 환경 설정

### GitHub Token

```bash
# .env (로컬 개발용)
VITE_GITHUB_TOKEN=github_pat_xxxxx
```

**필요 권한** (Fine-grained PAT):
- Repository: `UROCK-INC/design-system`
- Permissions: `Contents` (Read and Write) + `Pull Requests` (Read and Write)

**빌드 시 주입**:
```typescript
// vite.plugin.config.ts
define: {
  GITHUB_TOKEN: JSON.stringify(env.VITE_GITHUB_TOKEN || ""),
}
```

Plugin Backend(`FigmaPlugin.ts`)에서 `GITHUB_TOKEN` 전역 변수로 사용합니다.

---

## DeployStatus 상태 흐름

```
idle
 │
 ├── checking-pr      → PR 확인
 ├── creating-branch   → 새 브랜치 생성
 ├── committing        → 파일 커밋
 ├── creating-pr       → PR 생성
 ├── waiting-ci        → CI 빌드 대기 (5초 폴링)
 ├── done              → 배포 완료 (prUrl 포함)
 │
 ├── checking-ci       → 릴리즈 전 CI 확인
 ├── merging           → PR 머지
 ├── waiting-release   → 릴리즈 PR 대기 (10초 폴링)
 ├── release-done      → 릴리즈 완료
 │
 └── error             → 에러 (메시지 포함)
```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/frontend/ui/services/deployService.ts` | 배포 오케스트레이션 (deploy, tokens, release) |
| `src/frontend/ui/services/GitHubAPI.ts` | GitHub REST API 클라이언트 (프록시 기반) |
| `src/backend/FigmaPlugin.ts` | Plugin Backend (GitHub API 프록시 핸들러) |
| `vite.plugin.config.ts` | GITHUB_TOKEN 빌드 시 주입 |
| `.env.example` | 환경 변수 템플릿 |
