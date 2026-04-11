# Mask Visibility Processor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Figma의 "높이 0 alpha mask" 트릭을 감지하여, loading overlay 패턴에서 Content 형제에 `visibility: hidden` 역조건을 자동 부여하는 프로세서 구현.

**Architecture:** TreeBuilder 파이프라인 Phase 1에서, VisibilityProcessor 실행 직전에 새로운 전처리 단계를 추가한다. 이 단계는 `isMask: true` + RECTANGLE + height≈0 + `componentPropertyReferences.visible`인 노드를 감지하고, 같은 부모의 flow 자식에 역조건 dynamic style(`visibility: hidden`)을 부여한 뒤, mask 노드 자체를 트리에서 제거한다. VisibilityProcessor는 변경하지 않는다 — mask 노드 제거 후 더 이상 해당 노드를 처리할 필요가 없으므로.

**Tech Stack:** TypeScript, vitest

---

## Background

Figma에는 "이 요소가 보이면 저 요소를 숨겨라"는 직접적 표현이 없다. 디자이너들은 대신 높이 0짜리 alpha mask를 `componentPropertyReferences.visible`로 제어하여, loading=true일 때 mask가 Content를 클리핑하는 트릭을 쓴다. 코드 생성기는 이 트릭을 인식해서 실제 의도(`loading일 때 content를 visibility: hidden`)로 번역해야 한다.

### 패턴 식별 조건 (4가지 모두 충족):
1. `isMask: true` (원본 Figma 데이터, DataManager로 조회)
2. `type: "RECTANGLE"`
3. `absoluteBoundingBox.height < 1` (≈ 0)
4. `componentPropertyReferences.visible` 존재

이 조건은 fixture 87개 전수조사에서 false positive 없이 loading overlay 패턴(45건)만 정확히 잡는다.

### 파이프라인 위치
```
TreeBuilder.build() Phase 1:
  Step 1:   VariantMerger
  Step 1.1: InteractionLayerStripper
  Step 1.2: RedundantNodeCollapser
  Step 1.5: splitMultiComponentInstances
  Step 2:   PropsExtractor
  Step 3:   SlotProcessor
→ Step 3.5: MaskVisibilityProcessor (NEW)  ← 여기
  Step 4:   VisibilityProcessor
```

Step 3.5에 배치하는 이유:
- PropsExtractor 이후여야 prop 정의(PropDefinition)에 접근 가능
- VisibilityProcessor 이전이어야 mask 노드 제거 후 불필요한 조건 생성 방지
- SlotProcessor 이후여야 slot 처리와 충돌하지 않음

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/.../processors/MaskVisibilityProcessor.ts` | mask 패턴 감지 + 역조건 부여 + mask 노드 제거 |
| Modify | `src/.../TreeBuilder.ts:137` | Step 3.5로 MaskVisibilityProcessor 호출 추가 |
| Create | `test/compiler/caseMaskVisibility.test.ts` | Buttonsolid fixture 기반 회귀 테스트 |

Full paths:
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/MaskVisibilityProcessor.ts`
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts`
- `test/compiler/caseMaskVisibility.test.ts`

---

### Task 1: Failing Test 작성

**Files:**
- Create: `test/compiler/caseMaskVisibility.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

describe("Mask Visibility: loading overlay 패턴", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/failing/Buttonsolid.json"
  );

  it("should hide content with visibility:hidden when loading is true", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();
    const mainCode = result.mainCode;

    // loading=true일 때 content가 visibility:hidden이어야 함
    // (Emotion이든 Tailwind이든 visibility 관련 스타일이 있어야 함)
    expect(mainCode).toMatch(/visibility/i);
  });

  it("should not render mask node (height≈0 RECTANGLE) in output", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();
    const mainCode = result.mainCode;

    // Mask 노드 자체는 코드에서 렌더링되면 안 됨
    // (height 0짜리 의미없는 RECTANGLE)
    expect(mainCode).not.toMatch(/mask/i);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run test/compiler/caseMaskVisibility.test.ts`
Expected: FAIL — visibility 관련 코드가 없고, Mask 노드가 출력에 포함됨

- [ ] **Step 3: Commit**

```bash
git add test/compiler/caseMaskVisibility.test.ts
git commit -m "test: add failing tests for mask visibility loading overlay pattern"
```

---

### Task 2: MaskVisibilityProcessor 구현

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/MaskVisibilityProcessor.ts`

- [ ] **Step 1: 프로세서 파일 작성**

```typescript
import { InternalNode, PropDefinition, ConditionNode } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * MaskVisibilityProcessor
 *
 * Figma의 "높이 0 alpha mask" 트릭을 감지하여
 * loading overlay 패턴에서 Content 형제에 visibility:hidden 역조건을 부여.
 *
 * 감지 조건 (4가지 모두 충족):
 * 1. isMask: true (원본 Figma 데이터)
 * 2. type: RECTANGLE
 * 3. absoluteBoundingBox.height < 1
 * 4. componentPropertyReferences.visible 존재
 *
 * 동작:
 * 1. mask 노드의 visibility prop에서 ConditionNode 추출
 * 2. 같은 부모의 flow 자식(layoutPositioning !== "ABSOLUTE")에
 *    역조건 dynamic style { visibility: "hidden" } 부여
 * 3. mask 노드를 트리에서 제거
 */
export class MaskVisibilityProcessor {
  constructor(private readonly dataManager: DataManager) {}

  /**
   * 트리를 순회하며 mask visibility 패턴을 처리
   */
  public process(tree: InternalNode, props: PropDefinition[]): InternalNode {
    return this.processNode(tree, props);
  }

  private processNode(node: InternalNode, props: PropDefinition[]): InternalNode {
    if (node.children.length === 0) return node;

    // 현재 노드의 children에서 mask 패턴 감지
    const maskIndices: number[] = [];
    const maskConditions: Array<{ index: number; condition: ConditionNode }> = [];

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const maskInfo = this.detectMaskNode(child);
      if (maskInfo) {
        maskIndices.push(i);
        const condition = this.extractCondition(maskInfo.visibleRef, props);
        if (condition) {
          maskConditions.push({ index: i, condition });
        }
      }
    }

    // mask가 없으면 children만 재귀 처리
    if (maskConditions.length === 0) {
      return {
        ...node,
        children: node.children.map((c) => this.processNode(c, props)),
      };
    }

    // mask가 있으면:
    // 1. flow 자식에 역조건 dynamic style 부여
    // 2. mask 노드 제거
    const maskIndexSet = new Set(maskIndices);
    const newChildren: InternalNode[] = [];

    for (let i = 0; i < node.children.length; i++) {
      // mask 노드는 제거
      if (maskIndexSet.has(i)) continue;

      let child = node.children[i];

      // absolute 자식(Loading overlay 자체)은 건드리지 않음
      if (this.isAbsolutePositioned(child)) {
        newChildren.push(this.processNode(child, props));
        continue;
      }

      // flow 자식에 역조건 dynamic style 부여
      for (const { condition } of maskConditions) {
        child = this.addInverseVisibilityStyle(child, condition);
      }

      newChildren.push(this.processNode(child, props));
    }

    return { ...node, children: newChildren };
  }

  /**
   * mask 패턴 감지: isMask + RECTANGLE + height≈0 + componentPropertyReferences.visible
   */
  private detectMaskNode(
    node: InternalNode
  ): { visibleRef: string } | null {
    // componentPropertyReferences.visible 필요
    const visibleRef = node.componentPropertyReferences?.visible;
    if (!visibleRef) return null;

    // 원본 Figma 데이터에서 isMask, type, height 확인
    const { node: origNode } = this.dataManager.getById(node.id);
    if (!origNode) return null;

    const orig = origNode as any;
    if (orig.isMask !== true) return null;
    if (orig.type !== "RECTANGLE") return null;

    const height = orig.absoluteBoundingBox?.height ?? Infinity;
    if (height >= 1) return null;

    return { visibleRef };
  }

  /**
   * componentPropertyReferences.visible에서 역조건 추출
   * "Loading#29474:0" → { type: "truthy", prop: "loading" }
   * → 역조건: { type: "not", condition: { type: "truthy", prop: "loading" } }
   *
   * 주의: 역조건을 만드는 게 아니라 원래 조건을 만든다.
   * mask가 보일 때 = loading=true일 때 content를 숨겨야 하므로,
   * dynamic style의 condition은 원래 조건(truthy loading)이어야 한다.
   */
  private extractCondition(
    visibleRef: string,
    props: PropDefinition[]
  ): ConditionNode | null {
    const sourceKey = visibleRef.split("#")[0].trim();
    if (!sourceKey) return null;

    // PropDefinition에서 이름 찾기
    const propDef = props.find(
      (p) =>
        p.sourceKey === visibleRef ||
        p.sourceKey.split("#")[0].trim() === sourceKey ||
        p.name.toLowerCase() === sourceKey.toLowerCase()
    );

    const propName = propDef
      ? propDef.name
      : sourceKey
          .split(/\s+/)
          .map((w, i) =>
            i === 0
              ? w.charAt(0).toLowerCase() + w.slice(1)
              : w.charAt(0).toUpperCase() + w.slice(1)
          )
          .join("");

    // mask가 보일 때(=loading=true) content를 숨겨야 하므로
    // condition은 truthy (loading이 true일 때 visibility:hidden 적용)
    return { type: "truthy", prop: propName };
  }

  private isAbsolutePositioned(node: InternalNode): boolean {
    const { node: orig } = this.dataManager.getById(node.id);
    if (!orig) return false;
    return (orig as any).layoutPositioning === "ABSOLUTE";
  }

  /**
   * flow 자식에 dynamic style { visibility: "hidden" } 부여
   */
  private addInverseVisibilityStyle(
    node: InternalNode,
    condition: ConditionNode
  ): InternalNode {
    const dynamicEntry = {
      condition,
      style: { visibility: "hidden" } as Record<string, string | number>,
    };

    if (!node.styles) {
      return {
        ...node,
        styles: {
          base: {},
          dynamic: [dynamicEntry],
        },
      };
    }

    return {
      ...node,
      styles: {
        ...node.styles,
        dynamic: [...(node.styles.dynamic || []), dynamicEntry],
      },
    };
  }
}
```

- [ ] **Step 2: 테스트 실행 — 아직 실패 (TreeBuilder에 연결 안 됨)**

Run: `npx vitest run test/compiler/caseMaskVisibility.test.ts`
Expected: FAIL — 프로세서가 아직 파이프라인에 연결되지 않았으므로

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/MaskVisibilityProcessor.ts
git commit -m "feat: add MaskVisibilityProcessor for loading overlay pattern detection"
```

---

### Task 3: TreeBuilder에 MaskVisibilityProcessor 연결

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts`

- [ ] **Step 1: import 추가**

`TreeBuilder.ts` 상단 import 영역에 추가:

```typescript
import { MaskVisibilityProcessor } from "./processors/MaskVisibilityProcessor";
```

- [ ] **Step 2: constructor에 인스턴스 추가**

```typescript
private readonly maskVisibilityProcessor: MaskVisibilityProcessor;
```

constructor 내부:
```typescript
this.maskVisibilityProcessor = new MaskVisibilityProcessor(dataManager);
```

- [ ] **Step 3: build()에 Step 3.5 추가**

`TreeBuilder.ts:138` (Step 4 `visibilityProcessor.applyVisibility` 직전)에 삽입:

```typescript
    // Step 3.5: Mask visibility 패턴 처리
    // — Figma의 높이 0 alpha mask 트릭을 감지하여
    //   loading overlay 패턴에서 Content에 visibility:hidden 역조건 부여 + mask 노드 제거
    tree = this.maskVisibilityProcessor.process(tree, props);
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npx vitest run test/compiler/caseMaskVisibility.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 테스트 실행 — 회귀 없음 확인**

Run: `npx vitest run`
Expected: 기존 테스트 모두 PASS

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts
git commit -m "feat: integrate MaskVisibilityProcessor into TreeBuilder pipeline (Step 3.5)"
```

---

### Task 4: Buttonbutton fixture 교차 검증

**Files:**
- Modify: `test/compiler/caseMaskVisibility.test.ts`

Buttonbutton.json에도 같은 패턴(Loading mask 24건)이 있으므로 교차 검증한다.

- [ ] **Step 1: 테스트 추가**

`caseMaskVisibility.test.ts`에 추가:

```typescript
describe("Mask Visibility: Buttonbutton 교차 검증", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/failing/Buttonbutton.json"
  );

  it("should hide content with visibility:hidden when loading is true", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();
    const mainCode = result.mainCode;

    expect(mainCode).toMatch(/visibility/i);
  });

  it("should not render mask node in output", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();
    const mainCode = result.mainCode;

    // Mask라는 이름의 height≈0 RECTANGLE은 출력에 없어야 함
    // (단, "mask" 단어가 CSS property로 쓰일 수는 있으므로 노드 이름 기준 확인)
    expect(mainCode).not.toMatch(/<[^>]*mask/i);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run test/compiler/caseMaskVisibility.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add test/compiler/caseMaskVisibility.test.ts
git commit -m "test: add Buttonbutton cross-validation for mask visibility pattern"
```
