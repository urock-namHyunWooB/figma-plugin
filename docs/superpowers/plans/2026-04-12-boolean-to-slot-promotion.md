# Boolean-to-Slot Promotion 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `isExposedInstance: true`인 INSTANCE를 제어하는 BOOLEAN prop을 자동으로 ReactNode 슬롯으로 승격하고, 감지 책임을 DesignPatternDetector로 분리한다.

**Architecture:** DesignPatternDetector(Step 0)에서 `exposedInstanceSlot` 패턴을 감지하여 `DesignPattern[]`에 추가. VariantMerger가 `node.metadata.designPatterns`에 부착. SlotProcessor(Step 3)가 해당 패턴을 소비하여 boolean→slot 승격 + bindings 설정. 기존 SlotProcessor의 visibility 감지 로직은 제거.

**Tech Stack:** TypeScript, vitest

---

### Task 1: DesignPattern 타입 확장

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/types/types.ts:52-96`

- [ ] **Step 1: `exposedInstanceSlot` 타입을 DesignPattern union에 추가**

```typescript
// types.ts의 DesignPattern 타입 끝 (layoutModeSwitch 다음)에 추가:

  /** BOOLEAN visibility가 제어하는 노드 내 isExposedInstance INSTANCE → ReactNode 슬롯 승격 대상 */
  | {
      type: "exposedInstanceSlot";
      /** visibility가 제어되는 노드 ID (FRAME 또는 INSTANCE) */
      nodeId: string;
      /** exposed INSTANCE의 노드 ID */
      instanceNodeId: string;
      /** componentPropertyReferences.visible 값 (예: "Leading Icon#438:4") */
      visibleRef: string;
    };
```

- [ ] **Step 2: tsc로 타입 체크**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음 (새 union member 추가만이므로)

- [ ] **Step 3: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/types/types.ts
git commit -m "feat(types): DesignPattern에 exposedInstanceSlot 타입 추가"
```

---

### Task 2: DesignPatternDetector에 exposedInstanceSlot 감지 추가

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Modify: `test/compiler/design-pattern-detector.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/compiler/design-pattern-detector.test.ts` 끝에 추가:

```typescript
describe("exposedInstanceSlot", () => {
  it("BOOLEAN visibility + FRAME > exposed INSTANCE → exposedInstanceSlot 패턴", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        "Leading Icon#438:4": { type: "BOOLEAN", defaultValue: false },
      },
      children: [{
        type: "COMPONENT", name: "Default",
        children: [{
          id: "frame-1", type: "FRAME", name: "Leading Icon",
          componentPropertyReferences: { visible: "Leading Icon#438:4" },
          children: [{
            id: "inst-1", type: "INSTANCE", name: "Leading Icon",
            isExposedInstance: true,
            children: [],
          }],
        }],
      }],
    } as any;
    const patterns = detector.detect(node);
    expect(patterns).toContainEqual({
      type: "exposedInstanceSlot",
      nodeId: "frame-1",
      instanceNodeId: "inst-1",
      visibleRef: "Leading Icon#438:4",
    });
  });

  it("BOOLEAN visibility + INSTANCE 직접 exposed → exposedInstanceSlot 패턴", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        "Icon#100:0": { type: "BOOLEAN", defaultValue: false },
      },
      children: [{
        type: "COMPONENT", name: "Default",
        children: [{
          id: "inst-2", type: "INSTANCE", name: "Icon",
          isExposedInstance: true,
          componentPropertyReferences: { visible: "Icon#100:0" },
          children: [],
        }],
      }],
    } as any;
    const patterns = detector.detect(node);
    expect(patterns).toContainEqual({
      type: "exposedInstanceSlot",
      nodeId: "inst-2",
      instanceNodeId: "inst-2",
      visibleRef: "Icon#100:0",
    });
  });

  it("BOOLEAN visibility + non-exposed INSTANCE → 패턴 없음 (loading 케이스)", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        "Loading#29474:0": { type: "BOOLEAN", defaultValue: false },
      },
      children: [{
        type: "COMPONENT", name: "Default",
        children: [{
          id: "frame-loading", type: "FRAME", name: "Loading",
          componentPropertyReferences: { visible: "Loading#29474:0" },
          children: [{
            id: "inst-spinner", type: "INSTANCE", name: "Loading",
            isExposedInstance: false,
            children: [],
          }],
        }],
      }],
    } as any;
    const patterns = detector.detect(node);
    expect(patterns.filter(p => p.type === "exposedInstanceSlot")).toHaveLength(0);
  });

  it("BOOLEAN visibility + FRAME 내 exposed INSTANCE 없음 → 패턴 없음", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        "Overlay#200:0": { type: "BOOLEAN", defaultValue: false },
      },
      children: [{
        type: "COMPONENT", name: "Default",
        children: [{
          id: "frame-overlay", type: "FRAME", name: "Overlay",
          componentPropertyReferences: { visible: "Overlay#200:0" },
          children: [
            { id: "rect-1", type: "RECTANGLE", name: "BG", children: [] },
          ],
        }],
      }],
    } as any;
    const patterns = detector.detect(node);
    expect(patterns.filter(p => p.type === "exposedInstanceSlot")).toHaveLength(0);
  });

  it("여러 variant에서 중복 감지 방지 (dedup)", () => {
    const makeVariant = (name: string) => ({
      type: "COMPONENT", name,
      children: [{
        id: "frame-1", type: "FRAME", name: "Leading Icon",
        componentPropertyReferences: { visible: "Leading Icon#438:4" },
        children: [{
          id: "inst-1", type: "INSTANCE", name: "Leading Icon",
          isExposedInstance: true,
          children: [],
        }],
      }],
    });
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        "Leading Icon#438:4": { type: "BOOLEAN", defaultValue: false },
      },
      children: [
        makeVariant("Variant=Primary"),
        makeVariant("Variant=Secondary"),
      ],
    } as any;
    const patterns = detector.detect(node);
    expect(patterns.filter(p => p.type === "exposedInstanceSlot")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts -t "exposedInstanceSlot" 2>&1 | tail -20`
Expected: 5개 테스트 FAIL (4개는 패턴 미감지, 1개는 패턴이 없으므로 통과할 수 있음)

- [ ] **Step 3: DesignPatternDetector에 detectExposedInstanceSlot 구현**

`DesignPatternDetector.ts`의 `walkRawNode` 메서드에 호출 추가:

```typescript
// walkRawNode 내부, 기존 detect 호출들 다음에 추가:
this.detectExposedInstanceSlot(node, seenIds, patterns);
```

그리고 새 private 메서드 추가:

```typescript
// ─────────────────────────────────────────────────────────────────────────
// exposedInstanceSlot
// ─────────────────────────────────────────────────────────────────────────

private detectExposedInstanceSlot(
  node: any,
  seenIds: Set<string>,
  patterns: DesignPattern[],
): void {
  const visibleRef = node.componentPropertyReferences?.visible;
  if (!visibleRef) return;

  // 노드 자체가 exposed INSTANCE인 경우
  if (node.type === "INSTANCE" && node.isExposedInstance === true) {
    const key = `exposedInstanceSlot:${visibleRef}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);

    patterns.push({
      type: "exposedInstanceSlot",
      nodeId: node.id,
      instanceNodeId: node.id,
      visibleRef,
    });
    return;
  }

  // 직계 자식에서 exposed INSTANCE 찾기
  const children: any[] = node.children ?? [];
  for (const child of children) {
    if (child.type === "INSTANCE" && child.isExposedInstance === true) {
      const key = `exposedInstanceSlot:${visibleRef}`;
      if (seenIds.has(key)) return;
      seenIds.add(key);

      patterns.push({
        type: "exposedInstanceSlot",
        nodeId: node.id,
        instanceNodeId: child.id,
        visibleRef,
      });
      return;
    }
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts -t "exposedInstanceSlot" 2>&1 | tail -20`
Expected: 5개 테스트 모두 PASS

- [ ] **Step 5: 전체 detector 테스트 회귀 확인**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts 2>&1 | tail -10`
Expected: 모든 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts test/compiler/design-pattern-detector.test.ts
git commit -m "feat(detector): exposedInstanceSlot 패턴 감지 추가"
```

---

### Task 3: SlotProcessor를 패턴 소비 방식으로 전환

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/SlotProcessor.ts`

이 태스크에서는 SlotProcessor의 기존 visibility 감지 로직을 DesignPatternDetector 결과 소비로 교체한다.

- [ ] **Step 1: 기존 전체 테스트 상태 확인 (baseline)**

Run: `npx vitest run 2>&1 | tail -20`
Expected: 현재 통과하는 테스트 수 기록

- [ ] **Step 2: SlotProcessor에 패턴 소비 메서드 추가**

`SlotProcessor.ts`의 `detectAndConvertIndividualSlots` 메서드를 수정. 기존 `collectVisibilityProps`를 패턴 기반으로 교체:

```typescript
/**
 * 개별 slot 감지 및 props 업데이트
 *
 * 1. metadata.designPatterns에서 exposedInstanceSlot 패턴을 읽어 slot 후보 수집
 * 2. 기존 INSTANCE visibility 직접 감지 (패턴이 없는 케이스 — 후방 호환)
 * 3. VARIANT True/False 패턴 방식
 */
private detectAndConvertIndividualSlots(
  tree: InternalTree,
  props: PropDefinition[]
): PropDefinition[] {
  const propMap = new Map(props.map((p) => [p.sourceKey, p]));
  const slotInfo = new Map<string, { sourceKey: string; nodeIds: Set<string> }>();
  const nodeToSlotProp = new Map<string, string>();

  // 1. DesignPattern 기반 감지 (exposedInstanceSlot)
  this.collectFromDesignPatterns(tree, propMap, slotInfo, nodeToSlotProp);

  // 2. 기존 INSTANCE visibility 직접 감지 (후방 호환)
  this.collectVisibilityProps(tree, propMap, slotInfo, nodeToSlotProp);

  // 3. VARIANT True/False 패턴 방식
  this.collectVariantVisibilitySlots(tree, props, slotInfo, nodeToSlotProp);

  // 4. INSTANCE 노드에 bindings 설정
  this.applySlotBindings(tree, propMap, slotInfo, nodeToSlotProp);
  this.applyVariantSlotBindings(tree, props, slotInfo, nodeToSlotProp);

  // 5. boolean prop → slot으로 업그레이드
  return props.map((prop) => {
    if (slotInfo.has(prop.name)) {
      const info = slotInfo.get(prop.name)!;
      const representativeNodeId = info.nodeIds.values().next().value!;
      const componentInfo = this.resolveSlotComponentInfo(representativeNodeId);

      return {
        ...prop,
        type: "slot",
        defaultValue: null,
        ...componentInfo,
        nodeId: representativeNodeId,
      } as unknown as SlotPropDefinition;
    }
    return prop;
  });
}
```

새 private 메서드 `collectFromDesignPatterns` 추가:

```typescript
/**
 * DesignPattern에서 exposedInstanceSlot을 읽어 slot 후보 수집
 *
 * 트리를 순회하며 metadata.designPatterns에 exposedInstanceSlot이 있는 노드를 찾고,
 * visibleRef로 매칭되는 BOOLEAN prop을 slot으로 등록한다.
 */
private collectFromDesignPatterns(
  node: InternalTree,
  propMap: Map<string, PropDefinition>,
  slotInfo: Map<string, { sourceKey: string; nodeIds: Set<string> }>,
  nodeToSlotProp: Map<string, string>
): void {
  const patterns = node.metadata?.designPatterns;
  if (patterns) {
    for (const pattern of patterns) {
      if (pattern.type !== "exposedInstanceSlot") continue;

      const sourceKey = pattern.visibleRef;
      const propDef = propMap.get(sourceKey);
      if (!propDef || propDef.type !== "boolean") continue;

      const existing = slotInfo.get(propDef.name);
      if (existing) {
        existing.nodeIds.add(pattern.instanceNodeId);
      } else {
        slotInfo.set(propDef.name, {
          sourceKey,
          nodeIds: new Set([pattern.instanceNodeId]),
        });
      }
      nodeToSlotProp.set(pattern.instanceNodeId, propDef.name);
    }
  }

  // 자식 노드 재귀 탐색
  if (node.children) {
    for (const child of node.children) {
      this.collectFromDesignPatterns(child, propMap, slotInfo, nodeToSlotProp);
    }
  }
}
```

- [ ] **Step 3: 기존 collectVisibilityProps의 INSTANCE 전용 조건 유지**

`collectVisibilityProps`는 그대로 유지한다 (후방 호환). 이미 `slotInfo`에 등록된 prop은 `collectFromDesignPatterns`에서 처리되었으므로, `collectVisibilityProps`가 중복 등록해도 `Set`으로 관리되어 문제 없다.

- [ ] **Step 4: applySlotBindings에서 FRAME 자식 INSTANCE에도 bindings 적용**

기존 `applySlotBindings`는 INSTANCE 노드의 `componentPropertyReferences.visible`만 체크한다. FRAME 노드에 visible ref가 있는 경우, 자식 INSTANCE에 bindings를 적용해야 한다:

```typescript
private applySlotBindings(
  node: InternalTree,
  propMap: Map<string, PropDefinition>,
  slotInfo: Map<string, { sourceKey: string; nodeIds: Set<string> }>,
  nodeToSlotProp: Map<string, string>
): void {
  // 기존: INSTANCE에 직접 visible ref가 있는 경우
  if (node.type === "INSTANCE" && node.componentPropertyReferences?.visible) {
    const visibleRef = node.componentPropertyReferences.visible;
    const propDef = propMap.get(visibleRef);

    if (propDef && slotInfo.has(propDef.name)) {
      node.bindings = {
        ...node.bindings,
        content: { prop: propDef.name },
      };
    }
  }

  // 신규: nodeToSlotProp에 등록된 노드 (DesignPattern에서 감지된 INSTANCE)
  if (node.type === "INSTANCE" && !node.bindings?.content) {
    const propName = nodeToSlotProp.get(node.id);
    if (propName) {
      node.bindings = {
        ...node.bindings,
        content: { prop: propName },
      };
    }
  }

  if (node.children) {
    for (const child of node.children) {
      this.applySlotBindings(child, propMap, slotInfo, nodeToSlotProp);
    }
  }
}
```

- [ ] **Step 5: 전체 테스트 실행**

Run: `npx vitest run 2>&1 | tail -20`
Expected: 기존 테스트와 동일한 통과 수 (또는 Buttonsolid 관련 snapshot이 변경될 수 있음)

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/SlotProcessor.ts
git commit -m "feat(slot): SlotProcessor에 DesignPattern 소비 로직 추가"
```

---

### Task 4: Buttonsolid fixture 통합 테스트

**Files:**
- Create: `test/compiler/test-buttonsolid-slot-promotion.test.ts`

- [ ] **Step 1: Buttonsolid의 slot 승격 결과를 검증하는 테스트 작성**

```typescript
import { describe, it, expect } from "vitest";
import { compileFixture } from "./helpers/compileFixture";

describe("Buttonsolid: Boolean-to-Slot Promotion", () => {
  const result = compileFixture("failing/Buttonsolid");

  it("leadingIcon은 slot (ReactNode) 타입이어야 한다", () => {
    const prop = result.props.find((p) => p.name === "leadingIcon");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("slot");
  });

  it("trailingIcon은 slot (ReactNode) 타입이어야 한다", () => {
    const prop = result.props.find((p) => p.name === "trailingIcon");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("slot");
  });

  it("loading은 boolean 타입을 유지해야 한다", () => {
    const prop = result.props.find((p) => p.name === "loading");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("boolean");
  });

  it("label은 string 타입을 유지해야 한다", () => {
    const prop = result.props.find((p) => p.name === "label");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("string");
  });
});
```

- [ ] **Step 2: compileFixture 헬퍼 존재 확인**

Run: `grep -r "compileFixture" test/compiler/ --include="*.ts" -l 2>&1 | head -5`

헬퍼가 없으면 기존 테스트 패턴을 참고하여 작성해야 한다. 기존 `test/compiler/allFixtures.test.ts`나 `test-buttonsolid-conditional-group.test.ts`의 패턴을 따른다.

- [ ] **Step 3: 테스트 실행**

Run: `npx vitest run test/compiler/test-buttonsolid-slot-promotion.test.ts 2>&1 | tail -20`
Expected: `leadingIcon`과 `trailingIcon`이 slot으로 승격되어 PASS

- [ ] **Step 4: 커밋**

```bash
git add test/compiler/test-buttonsolid-slot-promotion.test.ts
git commit -m "test: Buttonsolid slot 승격 통합 테스트"
```

---

### Task 5: 기존 테스트 회귀 확인 및 snapshot 업데이트

**Files:**
- Potentially modify: `test/compiler/**/__snapshots__/*`

- [ ] **Step 1: 전체 테스트 실행**

Run: `npx vitest run 2>&1 | tail -30`
Expected: 실패하는 테스트 확인

- [ ] **Step 2: snapshot diff가 의미적으로 올바른지 확인**

실패한 snapshot이 있다면, `npx vitest run -u` 전에 diff를 확인한다:

Run: `npx vitest run 2>&1 | grep -A 5 "Snapshot"`

변경된 prop 타입이 `boolean → slot`이고 생성 코드에서 `{leadingIcon}` 형태로 렌더링되는지 검증한다.

- [ ] **Step 3: 올바른 snapshot만 업데이트**

Run: `npx vitest run -u 2>&1 | tail -10`
Expected: 모든 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add -A test/compiler/
git commit -m "test: slot 승격에 따른 snapshot 업데이트"
```

---

### Task 6: SlotProcessor 감지 로직 제거 (리팩토링)

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/SlotProcessor.ts`

Task 3에서 `collectFromDesignPatterns`를 추가하고 기존 `collectVisibilityProps`를 후방 호환으로 유지했다. 이제 패턴 기반 감지가 검증되었으므로, `collectVisibilityProps`의 감지 로직을 정리한다.

- [ ] **Step 1: collectVisibilityProps를 제거하고 collectFromDesignPatterns만 사용**

`detectAndConvertIndividualSlots`에서 `collectVisibilityProps` 호출을 제거:

```typescript
private detectAndConvertIndividualSlots(
  tree: InternalTree,
  props: PropDefinition[]
): PropDefinition[] {
  const propMap = new Map(props.map((p) => [p.sourceKey, p]));
  const slotInfo = new Map<string, { sourceKey: string; nodeIds: Set<string> }>();
  const nodeToSlotProp = new Map<string, string>();

  // 1. DesignPattern 기반 감지 (exposedInstanceSlot)
  this.collectFromDesignPatterns(tree, propMap, slotInfo, nodeToSlotProp);

  // 2. VARIANT True/False 패턴 방식 (이건 유지 — merged tree 의존)
  this.collectVariantVisibilitySlots(tree, props, slotInfo, nodeToSlotProp);

  // 3. INSTANCE 노드에 bindings 설정
  this.applySlotBindings(tree, propMap, slotInfo, nodeToSlotProp);
  this.applyVariantSlotBindings(tree, props, slotInfo, nodeToSlotProp);

  // 4. boolean prop → slot으로 업그레이드
  return props.map((prop) => {
    if (slotInfo.has(prop.name)) {
      const info = slotInfo.get(prop.name)!;
      const representativeNodeId = info.nodeIds.values().next().value!;
      const componentInfo = this.resolveSlotComponentInfo(representativeNodeId);

      return {
        ...prop,
        type: "slot",
        defaultValue: null,
        ...componentInfo,
        nodeId: representativeNodeId,
      } as unknown as SlotPropDefinition;
    }
    return prop;
  });
}
```

그리고 `collectVisibilityProps` 메서드와 기존 `applySlotBindings`의 `componentPropertyReferences.visible` 분기를 삭제한다.

- [ ] **Step 2: 사용되지 않는 메서드 정리**

`collectVisibilityProps`를 삭제한다. `applySlotBindings`는 `nodeToSlotProp` 기반 로직만 남긴다:

```typescript
private applySlotBindings(
  node: InternalTree,
  _propMap: Map<string, PropDefinition>,
  _slotInfo: Map<string, { sourceKey: string; nodeIds: Set<string> }>,
  nodeToSlotProp: Map<string, string>
): void {
  if (node.type === "INSTANCE" && !node.bindings?.content) {
    const propName = nodeToSlotProp.get(node.id);
    if (propName) {
      node.bindings = {
        ...node.bindings,
        content: { prop: propName },
      };
    }
  }

  if (node.children) {
    for (const child of node.children) {
      this.applySlotBindings(child, _propMap, _slotInfo, nodeToSlotProp);
    }
  }
}
```

- [ ] **Step 3: 전체 테스트 통과 확인**

Run: `npx vitest run 2>&1 | tail -20`
Expected: 모든 테스트 PASS (제거한 감지 로직이 패턴 소비로 완전히 대체되었는지 확인)

만약 실패하는 fixture가 있다면, 해당 fixture의 Figma 데이터에 `isExposedInstance`가 없을 수 있다. 그 경우 `collectVisibilityProps`를 fallback으로 복원하고, 제거 범위를 좁힌다.

- [ ] **Step 4: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/SlotProcessor.ts
git commit -m "refactor(slot): collectVisibilityProps 제거, 패턴 소비로 완전 전환"
```

---

### Task 7: DesignPatternDetector 기술 문서 업데이트

**Files:**
- Modify: `docs/guide/` 내 DesignPatternDetector 관련 문서 (존재하면)
- Modify: `CLAUDE.md` (DesignPatternDetector 패턴 목록이 있으면)

- [ ] **Step 1: 기존 문서에서 DesignPatternDetector 언급 확인**

Run: `grep -rl "DesignPatternDetector\|designPattern" docs/ CLAUDE.md 2>/dev/null | head -10`

- [ ] **Step 2: 해당 문서에 exposedInstanceSlot 패턴 설명 추가**

문서에 기존 패턴 목록이 있으면 다음을 추가:

```markdown
- exposedInstanceSlot: BOOLEAN visibility + isExposedInstance INSTANCE → ReactNode 슬롯 승격 대상
```

`CLAUDE.md`의 DesignPatternDetector 설명에도 해당 패턴을 추가한다.

- [ ] **Step 3: 커밋**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: DesignPatternDetector에 exposedInstanceSlot 패턴 문서 추가"
```
