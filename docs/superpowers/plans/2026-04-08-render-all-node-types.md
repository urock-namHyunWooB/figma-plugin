# 모든 노드 타입 렌더링 허용 — 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** COMPONENT_SET 전용 게이트(App.tsx, FigmaPlugin.ts)를 제거하고 모든 SceneNode 타입을 코드 생성 입력으로 받게 한다.

**Architecture:** 진입 게이트 두 곳만 제거하고 파이프라인 깊은 곳은 그대로 둔다. `DataManager`/`VariantMerger`는 이미 비-COMPONENT_SET 분기를 갖고 있다. 픽스처 기반 풀빌드 테스트로 회귀를 막고, 깨지는 곳이 발견되면 그 지점에만 핀포인트 가드를 추가한다.

**Tech Stack:** TypeScript, React 19, Vitest, Figma Plugin API.

**Spec:** `docs/superpowers/specs/2026-04-08-render-all-node-types-design.md`

---

## 파일 구조

| 파일 | 역할 | 변경 종류 |
|---|---|---|
| `src/backend/FigmaPlugin.ts` | 백엔드 진입점 — 선택 핸들러 | 자동 점프 제거 + 빈/멀티 선택 처리 |
| `src/frontend/ui/App.tsx` | UI 컨테이너 — 코드 생성 트리거, 탭 렌더 | 게이트 축소 + Variants 탭 조건부 숨김 |
| `test/tree-builder/full-build.test.ts` | TreeBuilder 풀빌드 회귀 테스트 | 비-COMPONENT_SET 케이스 추가 |

신규 파일은 만들지 않는다. 새 fixture 파일도 만들지 않는다 — 기존 COMPONENT_SET fixture에서 자식 노드를 추출해 비-COMPONENT_SET 입력으로 사용한다.

---

## Task 0: Worktree 생성

CLAUDE.md 규칙: "실험적 변경은 반드시 worktree에서 작업할 것."

- [ ] **Step 1: Worktree 생성**

```bash
git worktree add .claude/worktrees/render-all-node-types -b feat/render-all-node-types
cd .claude/worktrees/render-all-node-types
```

- [ ] **Step 2: 의존성 설치 확인**

```bash
npm install
```

Expected: 에러 없이 종료.

- [ ] **Step 3: 베이스라인 테스트 통과 확인**

```bash
npm run test -- test/tree-builder/full-build.test.ts
```

Expected: 모든 테스트 PASS (3개).

---

## Task 1: 단일 COMPONENT 풀빌드 회귀 테스트 추가

목적: COMPONENT_SET이 아닌 단일 COMPONENT 입력에서 `TreeBuilder`가 throw 없이 완료되고 비어있지 않은 UITree를 만드는지 검증한다.

**Files:**
- Modify: `test/tree-builder/full-build.test.ts` (line 88 직전 — 마지막 `it` 블록 다음에 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/tree-builder/full-build.test.ts`의 마지막 `it` 블록(line 87) 다음, `});` 닫힘 괄호 직전에 추가:

```ts
  it("should build UITree from a single COMPONENT (not COMPONENT_SET)", () => {
    // taptapButton의 첫 번째 variant(자식 COMPONENT)를 단독으로 입력
    const componentSetDoc = (taptapButton as any).info.document;
    const firstComponent = componentSetDoc.children[0];
    expect(firstComponent.type).toBe("COMPONENT");

    // FigmaNodeData 형태로 wrap (info.document만 교체)
    const singleComponentData = {
      ...(taptapButton as any),
      info: {
        ...(taptapButton as any).info,
        document: firstComponent,
      },
    };

    const dataManager = new DataManager(singleComponentData);
    const treeBuilder = new TreeBuilder(dataManager);

    // throw 없이 완료되어야 함
    const uiTree = treeBuilder.build(firstComponent);

    expect(uiTree.root).toBeDefined();
    expect(uiTree.root.id).toBe(firstComponent.id);
    expect(Array.isArray(uiTree.props)).toBe(true);
  });
```

- [ ] **Step 2: 테스트 실행 — 통과 또는 실패 확인**

```bash
npx vitest run test/tree-builder/full-build.test.ts -t "single COMPONENT"
```

Expected: PASS (파이프라인이 이미 단일 COMPONENT를 처리할 수 있다는 가설을 검증). 만약 FAIL이면 어디서 throw되는지 확인 후 Task 1.5로.

- [ ] **Step 3: 커밋 (테스트 통과한 경우만)**

```bash
git add test/tree-builder/full-build.test.ts
git commit -m "test(tree-builder): 단일 COMPONENT 풀빌드 회귀 테스트 추가"
```

---

## Task 1.5: (조건부) 단일 COMPONENT 크래시 픽스

**Task 1의 테스트가 통과했다면 이 Task는 건너뛴다.**

테스트가 실패한 경우에만 수행. 스택 트레이스에서 throw 위치를 확인하고 그 지점에 핀포인트 가드를 추가한다.

- [ ] **Step 1: 스택 트레이스 분석**

Task 1 Step 2의 출력에서 throw된 파일과 라인 확인.

- [ ] **Step 2: 핀포인트 가드 추가**

해당 파일에서 비-COMPONENT_SET 분기를 추가. 예시 패턴:

```ts
if (document.type !== "COMPONENT_SET") {
  // 단일 노드 처리 — return early or use single-node path
  return /* 적절한 빈 결과 */;
}
```

광범위 try/catch는 금지. 정확한 분기만 추가.

- [ ] **Step 3: 테스트 재실행**

```bash
npx vitest run test/tree-builder/full-build.test.ts -t "single COMPONENT"
```

Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add <fixed-file> test/tree-builder/full-build.test.ts
git commit -m "fix(tree-builder): 단일 COMPONENT 입력 처리 가드 추가"
```

---

## Task 2: 단일 FRAME 자식 풀빌드 회귀 테스트

목적: COMPONENT_SET 안의 FRAME 자식을 단독 입력으로 받았을 때 파이프라인이 죽지 않는지 검증.

**Files:**
- Modify: `test/tree-builder/full-build.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`taptapButton.json` 안에서 FRAME 타입 자식 노드를 찾아 입력으로 쓴다. Task 1 다음에 추가:

```ts
  it("should build UITree from a nested FRAME node (not COMPONENT_SET)", () => {
    // 임의의 FRAME 자식 노드 탐색
    const findFrame = (node: any): any => {
      if (node.type === "FRAME") return node;
      if (node.children) {
        for (const c of node.children) {
          const f = findFrame(c);
          if (f) return f;
        }
      }
      return null;
    };

    const frameNode = findFrame((taptapButton as any).info.document);
    if (!frameNode) {
      console.warn("FRAME 자식 노드 없음 — 스킵");
      return;
    }

    const singleFrameData = {
      ...(taptapButton as any),
      info: {
        ...(taptapButton as any).info,
        document: frameNode,
      },
    };

    const dataManager = new DataManager(singleFrameData);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build(frameNode);

    expect(uiTree.root).toBeDefined();
    expect(uiTree.root.id).toBe(frameNode.id);
  });
```

- [ ] **Step 2: 테스트 실행**

```bash
npx vitest run test/tree-builder/full-build.test.ts -t "nested FRAME"
```

Expected: PASS. 실패 시 Task 1.5와 동일한 패턴으로 핀포인트 가드 추가.

- [ ] **Step 3: 커밋**

```bash
git add test/tree-builder/full-build.test.ts
git commit -m "test(tree-builder): 단일 FRAME 풀빌드 회귀 테스트 추가"
```

---

## Task 3: 단일 TEXT 노드 풀빌드 회귀 테스트

**Files:**
- Modify: `test/tree-builder/full-build.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
  it("should build UITree from a single TEXT node", () => {
    const findText = (node: any): any => {
      if (node.type === "TEXT") return node;
      if (node.children) {
        for (const c of node.children) {
          const t = findText(c);
          if (t) return t;
        }
      }
      return null;
    };

    const textNode = findText((taptapButton as any).info.document);
    if (!textNode) {
      console.warn("TEXT 자식 노드 없음 — 스킵");
      return;
    }

    const singleTextData = {
      ...(taptapButton as any),
      info: {
        ...(taptapButton as any).info,
        document: textNode,
      },
    };

    const dataManager = new DataManager(singleTextData);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build(textNode);

    expect(uiTree.root).toBeDefined();
    expect(uiTree.root.id).toBe(textNode.id);
  });
```

- [ ] **Step 2: 테스트 실행**

```bash
npx vitest run test/tree-builder/full-build.test.ts -t "single TEXT"
```

Expected: PASS. 실패 시 Task 1.5 패턴으로 핀포인트 가드 추가.

- [ ] **Step 3: 커밋**

```bash
git add test/tree-builder/full-build.test.ts
git commit -m "test(tree-builder): 단일 TEXT 풀빌드 회귀 테스트 추가"
```

---

## Task 4: 백엔드 — 자동 점프 제거 + 빈/멀티 선택 처리

**Files:**
- Modify: `src/backend/FigmaPlugin.ts:23-51`

백엔드는 Figma 플러그인 샌드박스에서만 실행되므로 단위 테스트가 불가능하다. 이 Task는 manual verification으로 검증한다 (Task 8).

- [ ] **Step 1: 현재 코드 확인**

`src/backend/FigmaPlugin.ts:23-51`을 읽어 현재 구조 확인.

- [ ] **Step 2: `REQUEST_REFRESH` 핸들러 수정**

`src/backend/FigmaPlugin.ts:23-43`의 다음 블록을 교체:

**Before (line 23-43):**
```ts
    figma.ui.onmessage = async (msg) => {
      if (msg.type === MESSAGE_TYPES.REQUEST_REFRESH) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) return;
        const target = selection[0];
        const componentSet =
          target.type === "COMPONENT_SET"
            ? target
            : target.parent?.type === "COMPONENT_SET"
              ? target.parent
              : null;
        const nodes = componentSet ? [componentSet as SceneNode] : [...selection];
        const data = await this.getNodeData(nodes);
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data,
        });
        return;
      }
      await this.handleMessage(msg);
    };
```

**After:**
```ts
    figma.ui.onmessage = async (msg) => {
      if (msg.type === MESSAGE_TYPES.REQUEST_REFRESH) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          figma.ui.postMessage({
            type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
            data: null,
          });
          return;
        }
        // 멀티 선택은 첫 노드만 사용 (자동 점프 제거)
        const data = await this.getNodeData([selection[0]]);
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data,
        });
        return;
      }
      await this.handleMessage(msg);
    };
```

- [ ] **Step 3: `selectionchange` 핸들러 수정**

**Before (line 45-51):**
```ts
    figma.on("selectionchange", async () => {
      const data = await this.getNodeData([...figma.currentPage.selection]);
      figma.ui.postMessage({
        type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
        data,
      });
    });
```

**After:**
```ts
    figma.on("selectionchange", async () => {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data: null,
        });
        return;
      }
      // 멀티 선택은 첫 노드만 사용
      const data = await this.getNodeData([selection[0]]);
      figma.ui.postMessage({
        type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
        data,
      });
    });
```

- [ ] **Step 4: 백엔드 빌드**

```bash
npm run build:plugin
```

Expected: 에러 없이 `dist/code.js` 생성.

- [ ] **Step 5: 커밋**

```bash
git add src/backend/FigmaPlugin.ts
git commit -m "feat(backend): 선택 자동 점프 제거 + 빈/멀티 선택 처리"
```

---

## Task 5: 프론트엔드 — 코드 생성 게이트 축소

**Files:**
- Modify: `src/frontend/ui/App.tsx:338`

- [ ] **Step 1: 현재 코드 확인**

`src/frontend/ui/App.tsx:333-346` 읽기.

- [ ] **Step 2: 게이트 조건 변경**

**Before (line 338):**
```ts
    if (!selectionNodeData || selectionNodeData.info?.document?.type !== "COMPONENT_SET") {
```

**After:**
```ts
    if (!selectionNodeData) {
```

(나머지 early return 본문은 그대로 둔다 — `selectionNodeData == null`일 때만 실행되므로 안전)

- [ ] **Step 3: UI 빌드**

```bash
npm run build:ui
```

Expected: 에러 없이 빌드 완료.

- [ ] **Step 4: 커밋**

```bash
git add src/frontend/ui/App.tsx
git commit -m "feat(frontend): 코드 생성 게이트를 빈 선택만 차단하도록 축소"
```

---

## Task 6: 프론트엔드 — Variants 탭 조건부 숨김

**Files:**
- Modify: `src/frontend/ui/App.tsx:529, 575-598, 253`

- [ ] **Step 1: 사용 가능한 탭 목록을 동적으로 계산**

`App.tsx:253`의 `activeTab` useState 선언 직후에 다음 코드를 추가한다 (이 시점에 `selectionNodeData` state는 이미 선언되어 있어야 한다 — 만약 그 아래에 선언되어 있다면 `selectionNodeData` 선언 다음 라인으로 이동):

```ts
  const isComponentSet = selectionNodeData?.info?.document?.type === "COMPONENT_SET";
  const visibleTabs = useMemo<TabId[]>(() => {
    return isComponentSet
      ? ["preview", "variants", "code", "publish", "release"]
      : ["preview", "code", "publish", "release"];
  }, [isComponentSet]);
```

`useMemo`가 import되어 있는지 확인. 안 되어 있으면 React import 라인에 추가.

- [ ] **Step 2: 탭 navigation 렌더 변경**

**Before (line 529):**
```ts
        {(["preview", "variants", "code", "publish", "release"] as TabId[]).map((tab) => (
```

**After:**
```ts
        {visibleTabs.map((tab) => (
```

- [ ] **Step 3: Variants 탭이 활성 상태인데 비-COMPONENT_SET으로 전환된 경우 자동 폴백**

Step 1의 코드 다음에 `useEffect` 추가:

```ts
  useEffect(() => {
    if (!isComponentSet && activeTab === "variants") {
      setActiveTab("preview");
    }
  }, [isComponentSet, activeTab]);
```

- [ ] **Step 4: Variants 탭의 비-COMPONENT_SET 안내 분기 제거**

`App.tsx:576`의 `{activeTab === "variants" && (` 라인을 다음과 같이 변경:

```ts
        {activeTab === "variants" && isComponentSet && (
```

그 다음, 같은 블록 안의 삼항 분기를 제거한다.

**삭제할 코드 (line 578-598 근방):**
```ts
            {selectionNodeData?.info?.document?.type !== "COMPONENT_SET" ? (
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "48px 24px",
                color: "#6b7280",
                textAlign: "center",
                gap: 12,
              }}>
                <span style={{ fontSize: 32 }}>&#x1F4CB;</span>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#374151" }}>
                  COMPONENT_SET을 선택해주세요
                </p>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                  Variants 탭은 여러 Variant를 가진 컴포넌트에서만 사용할 수 있습니다.<br />
                  Figma에서 Component Set을 선택해주세요.
                </p>
              </div>
            ) : (
              <>
```

그리고 같은 블록 끝부분 — `PropsMatrix` 등 원래 `:` 이후 `<>` 안에 있던 모든 콘텐츠의 닫힘 직전에 있는 다음 두 줄을 제거:

```ts
              </>
            )}
```

결과: 원래 `<>...PropsMatrix 등...</>` 안의 콘텐츠가 fragment 없이 바깥 `<div style={{ padding: 16 }}>` 안에 직접 위치한다. PropsMatrix 자체와 그 props는 절대 건드리지 않는다.

- [ ] **Step 5: UI 빌드**

```bash
npm run build:ui
```

Expected: 에러 없이 빌드 완료.

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/ui/App.tsx
git commit -m "feat(frontend): 비-COMPONENT_SET 노드에서 Variants 탭 숨김"
```

---

## Task 7: 전체 회귀 테스트 + 빌드

- [ ] **Step 1: 전체 테스트 실행**

```bash
npm run test
```

Expected: 모든 테스트 PASS. 실패 케이스가 있으면 픽스 후 재실행.

- [ ] **Step 2: 린트**

```bash
npm run lint
```

Expected: 에러 없음. 경고는 기존 수준 유지.

- [ ] **Step 3: 프로덕션 빌드**

```bash
npm run build:prod
```

Expected: `dist/code.js`, `dist/index.html` 생성, 에러 없음.

---

## Task 8: 수동 검증 (Figma)

자동 테스트로 커버되지 않는 부분 — UI 동작과 백엔드 selection handling.

- [ ] **Step 1: Figma에서 플러그인 로드**

`dist/code.js`, `dist/index.html`을 Figma 데스크탑 앱에서 새 플러그인으로 로드.

- [ ] **Step 2: COMPONENT_SET 선택 → 회귀 확인**

기존처럼 COMPONENT_SET을 선택하면 코드 생성됨, Variants 탭 표시됨.

- [ ] **Step 3: 단일 COMPONENT 선택 → 코드 생성됨**

COMPONENT_SET 안의 단일 variant(COMPONENT)를 클릭. 자동으로 부모로 점프하지 않고 그 COMPONENT 자체에서 코드가 생성되어야 함. Variants 탭은 사라져야 함.

- [ ] **Step 4: 단일 FRAME / TEXT / RECTANGLE 선택 → 코드 생성됨**

각 타입의 노드를 선택해서 코드가 throw 없이 생성되는지 확인. (출력 코드 품질은 후속 과제 — 여기선 크래시만 검증)

- [ ] **Step 5: 빈 선택 → 안내 메시지**

모든 선택을 해제. UI에서 빈 상태 안내가 보여야 함.

- [ ] **Step 6: 멀티 선택 → 첫 노드만 처리**

여러 노드를 동시 선택. 첫 번째 노드에 대한 코드만 생성되어야 함 (에러 없음).

- [ ] **Step 7: Variants 탭 자동 폴백**

COMPONENT_SET을 선택해서 Variants 탭으로 이동 → 다른 비-COMPONENT_SET 노드로 선택 변경 → 자동으로 Preview 탭으로 폴백되는지 확인.

수동 검증 중 발견된 크래시는 새 Task로 추가.

---

## Task 9: 최종 정리 + Plan 완료 마크

- [ ] **Step 1: 플랜 자체 체크리스트 완료 확인**

이 파일의 모든 `- [ ]` 박스가 `- [x]`로 마크되었는지 확인.

- [ ] **Step 2: PR 준비 (선택)**

```bash
git log --oneline dev..HEAD
```

커밋 히스토리 확인 후 사용자에게 머지 방식 결정 위임 (worktree → dev 머지 또는 PR 생성).

---

## 자체 리뷰 (Plan-internal)

**스펙 커버리지 검증:**

| 스펙 요구사항 | 커버 Task |
|---|---|
| 모든 SceneNode 타입 허용 | Task 1, 2, 3 (테스트), Task 5 (게이트 축소) |
| 자동 점프 제거 | Task 4 |
| Variants 탭 숨김 | Task 6 |
| 빈 선택 안내 | Task 4 (백엔드 빈 data 전송) + Task 5 (기존 빈 상태 재사용) |
| 멀티 선택 = 첫 노드만 | Task 4 |
| 핀포인트 가드 (광범위 방어 금지) | Task 1.5 (조건부) |
| 회귀 방지 | Task 1, 2, 3, Task 7 (전체 테스트) |
| 수동 검증 (UI 동작) | Task 8 |
