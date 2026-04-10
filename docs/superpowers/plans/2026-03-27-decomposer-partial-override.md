# Decomposer 부분 Override 분해 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** compound prop(`state+style+tone`)에서 특정 prop 값이 CSS 속성을 uniform하게 override하는 패턴을 감지하여, 3-prop compound를 `state` + `style+tone` 2개 그룹으로 분리하는 기능을 DynamicStyleDecomposer에 추가.

**Architecture:** `removeUniformProperties` 이후 새로운 후처리 단계를 추가. compound 그룹 내에서 특정 dimension의 값이 CSS 속성을 uniform하게 만드는 경우, 해당 CSS 속성을 compound에서 추출하여 개별 prop 그룹으로 이동. pseudo-class도 함께 이동하여 CSS cascade 충돌 방지.

**Tech Stack:** TypeScript, Vitest

---

## 문제 분석

### 현재 상태

Btnsbtn 컴포넌트의 `background` CSS 속성:

| state | style+tone | background |
|-------|-----------|------------|
| default | filled+blue | `#628CF5` |
| default | filled+red | `#FF8484` |
| default | outlined+blue | `#F7F9FE` |
| default | outlined+red/basic | `#FFF` |
| loading | **전부 동일** | `#FFF` |
| disable | **전부 동일** | `#E6E6E6` |

`findControllingProp`은 background의 owner를 `state+style+tone` (3-prop compound)로 결정. 이유:
- `state` 단독 → default 내에서 style+tone에 따라 달라짐 → NOT consistent
- `style+tone` 단독 → loading일 때 전부 #FFF로 style+tone 무관 → NOT consistent
- `state+style+tone` → 모든 조합이 일관적 → consistent ✓

### 목표 상태

background를 2개 그룹으로 분리:
1. `stateStyles["loading"]` → `background: #FFF` (+ pseudo override)
2. `styleToneStyles["filled+blue"]` → `background: #628CF5` (+ pseudo)

Emotion css 배열 순서: `[..., styleToneStyles, stateStyles]` — state가 뒤에서 override.

### 핵심 제약

**CSS pseudo-class 충돌**: `styleToneStyles`에 `&:active { bg: blue }` 가 있고 `stateStyles`에 `bg: white`만 있으면, `:active` 상태에서 blue가 이김 (pseudo가 normal보다 우선). 따라서 `stateStyles["loading"]`에도 동일한 pseudo override를 추가해야 함:
```css
stateStyles["loading"] = css`
  background: #FFF;
  &:active:not(:disabled) { background: #FFF; }
  &:hover { background: #FFF; }
`
```

**CSS 배열 순서**: override하는 prop의 스타일이 뒤에 와야 함. JsxGenerator의 css 배열 순서 제어 필요.

**border는 compound 유지**: background는 분리 가능하지만 border는 state+style+tone 모두 필요 → compound 엔트리 자체는 유지, background만 추출.

---

## 파일 구조

| 파일 | 변경 | 역할 |
|------|------|------|
| `DynamicStyleDecomposer.ts` | 수정 | compound 부분 override 후처리 추가 |
| `JsxGenerator.ts` | 수정 | css 배열 순서에 override 관계 반영 |
| `test/compiler/test-btnsbtn-decompose.test.ts` | 수정 | 분리 결과 검증 테스트 |
| `test/tree-builder/decomposer-partial-override.test.ts` | 생성 | 부분 override 단위 테스트 |

---

## Task 1: 단위 테스트 — 부분 override 감지

**Files:**
- Create: `test/tree-builder/decomposer-partial-override.test.ts`

- [ ] **Step 1: 테스트 파일 작성 — compound 내 부분 uniform 감지**

```typescript
import { describe, it, expect } from "vitest";
import { DynamicStyleDecomposer } from "@code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer";

/**
 * state+style+tone compound에서 background가:
 * - state=loading일 때 모든 style+tone에서 uniform (#FFF)
 * - state=default일 때 style+tone에 따라 다름
 * → background를 compound에서 추출하여 state + style+tone 개별 그룹으로 분리
 */
describe("DynamicStyleDecomposer partial override", () => {
  // loading은 background를 uniform하게 override, default는 style+tone에 따라 다름
  const dynamic = [
    // default+filled+blue
    { condition: { type: "and" as const, conditions: [
      { type: "eq" as const, prop: "state", value: "default" },
      { type: "eq" as const, prop: "style", value: "filled" },
      { type: "eq" as const, prop: "tone", value: "blue" },
    ]}, style: { background: "#628CF5", border: "none" } },
    // default+filled+red
    { condition: { type: "and" as const, conditions: [
      { type: "eq" as const, prop: "state", value: "default" },
      { type: "eq" as const, prop: "style", value: "filled" },
      { type: "eq" as const, prop: "tone", value: "red" },
    ]}, style: { background: "#FF8484", border: "none" } },
    // default+outlined+blue
    { condition: { type: "and" as const, conditions: [
      { type: "eq" as const, prop: "state", value: "default" },
      { type: "eq" as const, prop: "style", value: "outlined" },
      { type: "eq" as const, prop: "tone", value: "blue" },
    ]}, style: { background: "#F7F9FE", border: "2px solid #93B0F8" } },
    // loading+filled+blue
    { condition: { type: "and" as const, conditions: [
      { type: "eq" as const, prop: "state", value: "loading" },
      { type: "eq" as const, prop: "style", value: "filled" },
      { type: "eq" as const, prop: "tone", value: "blue" },
    ]}, style: { background: "#FFF", border: "2px solid #93B0F8" } },
    // loading+filled+red
    { condition: { type: "and" as const, conditions: [
      { type: "eq" as const, prop: "state", value: "loading" },
      { type: "eq" as const, prop: "style", value: "filled" },
      { type: "eq" as const, prop: "tone", value: "red" },
    ]}, style: { background: "#FFF", border: "2px solid #FF8484" } },
    // loading+outlined+blue
    { condition: { type: "and" as const, conditions: [
      { type: "eq" as const, prop: "state", value: "loading" },
      { type: "eq" as const, prop: "style", value: "outlined" },
      { type: "eq" as const, prop: "tone", value: "blue" },
    ]}, style: { background: "#FFF", border: "2px solid #EDEDED" } },
  ];

  it("background가 compound에서 분리되어 state + style+tone 각각에 배치되어야 한다", () => {
    const result = DynamicStyleDecomposer.decompose(dynamic);

    // state 그룹에 loading의 background가 있어야 함
    const stateGroup = result.get("state");
    expect(stateGroup).toBeTruthy();
    expect(stateGroup!.get("loading")?.style.background).toBe("#FFF");

    // style+tone 그룹에 default의 background가 있어야 함
    const styleToneGroup = result.get("style+tone");
    expect(styleToneGroup).toBeTruthy();
    expect(styleToneGroup!.get("filled+blue")?.style.background).toBe("#628CF5");
    expect(styleToneGroup!.get("filled+red")?.style.background).toBe("#FF8484");
    expect(styleToneGroup!.get("outlined+blue")?.style.background).toBe("#F7F9FE");
  });

  it("border는 여전히 state+style+tone compound에 남아있어야 한다", () => {
    const result = DynamicStyleDecomposer.decompose(dynamic);

    // border는 compound에 유지 (loading과 default 모두 style+tone에 따라 다름)
    const compound = result.get("state+style+tone");
    expect(compound).toBeTruthy();
    expect(compound!.get("loading+filled+blue")?.style.border).toBe("2px solid #93B0F8");
    expect(compound!.get("default+outlined+blue")?.style.border).toBe("2px solid #93B0F8");
  });

  it("compound에서 background가 제거되어야 한다", () => {
    const result = DynamicStyleDecomposer.decompose(dynamic);

    const compound = result.get("state+style+tone");
    if (compound) {
      for (const [, dv] of compound) {
        expect(dv.style.background).toBeUndefined();
      }
    }
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run test/tree-builder/decomposer-partial-override.test.ts`
Expected: FAIL — background가 `state+style+tone` compound에 그대로 있고 분리 안 됨

- [ ] **Step 3: Commit**

```bash
git add test/tree-builder/decomposer-partial-override.test.ts
git commit -m "test: decomposer partial override 분리 테스트 추가 (red)"
```

---

## Task 2: compound 부분 override 감지 및 분리

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer.ts`

### 알고리즘 설계

`removeUniformProperties` 이후, compound 그룹에 대해 추가 후처리:

```
splitPartialOverrides(result):
  for each compound group (예: "state+style+tone"):
    parts = compound.split("+")  // ["state", "style", "tone"]

    for each CSS key in compound entries:
      for each part P in parts:
        remaining = parts에서 P를 제외한 나머지  // ["style", "tone"]

        # P의 각 값에 대해, remaining 조합과 무관하게 CSS가 uniform한지 확인
        for each value V of P:
          entries where P=V → 이 CSS key의 값이 전부 동일한가?

        if SOME values of P are uniform AND SOME are not:
          # 부분 override 감지!
          # uniform한 값들(예: loading=#FFF) → state 그룹으로 이동 (+ pseudo)
          # 나머지(예: default=varies) → remaining compound로 이동 (예: style+tone)
          # 원래 compound에서 이 CSS key 제거
```

- [ ] **Step 1: `splitPartialOverrides` private static 메서드 추가**

DynamicStyleDecomposer.ts의 `removeUniformProperties` 호출 직후에 새 메서드를 호출하도록 수정.

`decomposeMultiProp` 메서드 끝 부분(`removeUniformProperties` 호출 후):
```typescript
// 후처리: compound 그룹의 부분 override 분리
this.splitPartialOverrides(result);
```

메서드 구현:
```typescript
/**
 * compound 그룹에서 부분 override 패턴을 감지하여 분리.
 *
 * 예: state+style+tone compound에서 background가
 *     state=loading일 때 모든 style+tone에서 동일(#FFF) → state로 추출
 *     state=default일 때 style+tone에 따라 다름 → style+tone으로 추출
 *
 * compound에서 해당 CSS 속성 제거, 개별 prop 그룹에 배치.
 * pseudo-class도 동일 패턴으로 분배.
 */
private static splitPartialOverrides(result: DecomposedResult): void {
  const compoundKeys = [...result.keys()].filter((k) => k.includes("+"));

  for (const compoundKey of compoundKeys) {
    const compoundMap = result.get(compoundKey)!;
    const parts = compoundKey.split("+");
    if (parts.length < 3) continue; // 2-prop compound는 더 분리 불가

    // compound의 모든 CSS 키 수집
    const allCssKeys = new Set<string>();
    for (const dv of compoundMap.values()) {
      for (const key of Object.keys(dv.style)) allCssKeys.add(key);
    }

    for (const cssKey of allCssKeys) {
      this.trySplitCssKey(cssKey, compoundKey, parts, compoundMap, result);
    }

    // compound가 비었으면 제거
    const allEmpty = [...compoundMap.values()].every(
      (dv) => Object.keys(dv.style).length === 0 && !dv.pseudo
    );
    if (allEmpty) result.delete(compoundKey);
  }
}
```

- [ ] **Step 2: `trySplitCssKey` 헬퍼 메서드 구현**

```typescript
/**
 * compound 그룹의 특정 CSS 키에 대해 부분 override 분리를 시도.
 *
 * 각 dimension(part)에 대해: 해당 dimension의 특정 값이
 * 나머지 dimension과 무관하게 CSS를 uniform하게 만드는지 확인.
 */
private static trySplitCssKey(
  cssKey: string,
  compoundKey: string,
  parts: string[],
  compoundMap: Map<string, DecomposedValue>,
  result: DecomposedResult
): void {
  for (let i = 0; i < parts.length; i++) {
    const overrideProp = parts[i]; // 예: "state"
    const remainingProps = parts.filter((_, idx) => idx !== i); // 예: ["style", "tone"]

    // overrideProp의 각 값별로 엔트리 그룹화
    const valueGroups = new Map<string, Map<string, string | number>>();
    // key: overrideProp 값 (예: "loading"), value: Map<remainingKey, cssValue>

    for (const [compoundValue, dv] of compoundMap) {
      if (!(cssKey in dv.style)) continue;
      const valueParts = compoundValue.split("+");
      const overrideValue = valueParts[i];
      const remainingKey = valueParts.filter((_, idx) => idx !== i).join("+");

      if (!valueGroups.has(overrideValue)) valueGroups.set(overrideValue, new Map());
      valueGroups.get(overrideValue)!.set(
        remainingKey,
        dv.style[cssKey]
      );
    }

    if (valueGroups.size < 2) continue; // 값이 1개면 분리 의미 없음

    // 각 overrideProp 값에 대해: uniform(모든 remaining에서 동일)인지 확인
    const uniformValues = new Map<string, string | number>(); // overrideValue → uniformCssValue
    const varyingValues = new Set<string>(); // overrideValue where css varies

    for (const [overrideValue, remainingMap] of valueGroups) {
      const cssValues = new Set(
        [...remainingMap.values()].map((v) => normalizeCssValue(String(v)))
      );
      if (cssValues.size === 1) {
        uniformValues.set(overrideValue, [...remainingMap.values()][0]);
      } else {
        varyingValues.add(overrideValue);
      }
    }

    // 부분 override: SOME uniform + SOME varying
    if (uniformValues.size === 0 || varyingValues.size === 0) continue;

    // === 분리 실행 ===

    // 1. uniform 값 → overrideProp 개별 그룹에 추가
    if (!result.has(overrideProp)) result.set(overrideProp, new Map());
    const propGroup = result.get(overrideProp)!;
    for (const [overrideValue, cssValue] of uniformValues) {
      if (!propGroup.has(overrideValue)) {
        propGroup.set(overrideValue, { style: {} });
      }
      propGroup.get(overrideValue)!.style[cssKey] = cssValue;

      // pseudo-class도 uniform이면 함께 이동 (CSS cascade 충돌 방지)
      this.movePseudoForUniform(
        cssKey, overrideValue, i, compoundMap, propGroup
      );
    }

    // 2. varying 값 → remainingProps compound 그룹에 추가
    const remainingKey = remainingProps.join("+");
    if (!result.has(remainingKey)) result.set(remainingKey, new Map());
    const remainingGroup = result.get(remainingKey)!;
    for (const overrideValue of varyingValues) {
      const remainingMap = valueGroups.get(overrideValue)!;
      for (const [rKey, cssValue] of remainingMap) {
        if (!remainingGroup.has(rKey)) {
          remainingGroup.set(rKey, { style: {} });
        }
        remainingGroup.get(rKey)!.style[cssKey] = cssValue;
      }
      // pseudo도 이동
      this.movePseudoForVarying(
        cssKey, overrideValue, i, remainingProps, compoundMap, remainingGroup
      );
    }

    // 3. compound에서 이 CSS key 제거
    for (const dv of compoundMap.values()) {
      delete dv.style[cssKey];
    }
    // compound의 pseudo에서도 이 CSS key 제거
    for (const dv of compoundMap.values()) {
      if (!dv.pseudo) continue;
      for (const pcStyle of Object.values(dv.pseudo)) {
        delete (pcStyle as Record<string, string | number>)[cssKey];
      }
    }

    break; // 이 cssKey에 대해 분리 완료, 다음 cssKey로
  }
}
```

- [ ] **Step 3: pseudo-class 이동 헬퍼 구현**

```typescript
/**
 * uniform override 값의 pseudo-class를 개별 prop 그룹에 복사.
 * CSS cascade에서 pseudo가 normal을 이기지 않도록 동일 pseudo에 override 값 설정.
 */
private static movePseudoForUniform(
  cssKey: string,
  overrideValue: string,
  overridePropIdx: number,
  compoundMap: Map<string, DecomposedValue>,
  propGroup: Map<string, DecomposedValue>
): void {
  // compound 엔트리 중 이 overrideValue를 가진 것들의 pseudo 수집
  const pseudoSelectors = new Set<string>();
  for (const [compoundValue, dv] of compoundMap) {
    const valueParts = compoundValue.split("+");
    if (valueParts[overridePropIdx] !== overrideValue) continue;
    if (!dv.pseudo) continue;
    for (const [pc, pcStyle] of Object.entries(dv.pseudo)) {
      if (cssKey in (pcStyle as Record<string, string | number>)) {
        pseudoSelectors.add(pc);
      }
    }
  }

  // 수집된 pseudo selector에 대해 override 값 설정
  if (pseudoSelectors.size === 0) return;
  const target = propGroup.get(overrideValue)!;
  const uniformCssValue = target.style[cssKey];
  if (!target.pseudo) target.pseudo = {};
  for (const pc of pseudoSelectors) {
    const pcKey = pc as PseudoClass;
    if (!target.pseudo[pcKey]) target.pseudo[pcKey] = {};
    target.pseudo[pcKey]![cssKey] = uniformCssValue;
  }

  // ALSO: varying 쪽의 pseudo에서 사용하는 selector도 추가
  // (styleTone에 :active가 있으면 state["loading"]에도 :active 필요)
  for (const [compoundValue, dv] of compoundMap) {
    const valueParts = compoundValue.split("+");
    if (valueParts[overridePropIdx] === overrideValue) continue; // skip self
    if (!dv.pseudo) continue;
    for (const [pc, pcStyle] of Object.entries(dv.pseudo)) {
      if (cssKey in (pcStyle as Record<string, string | number>)) {
        const pcKey = pc as PseudoClass;
        if (!target.pseudo[pcKey]) target.pseudo[pcKey] = {};
        if (!(cssKey in target.pseudo[pcKey]!)) {
          target.pseudo[pcKey]![cssKey] = uniformCssValue;
        }
      }
    }
  }
}

/**
 * varying 값의 pseudo-class를 remaining compound 그룹에 이동.
 */
private static movePseudoForVarying(
  cssKey: string,
  overrideValue: string,
  overridePropIdx: number,
  remainingProps: string[],
  compoundMap: Map<string, DecomposedValue>,
  remainingGroup: Map<string, DecomposedValue>
): void {
  for (const [compoundValue, dv] of compoundMap) {
    const valueParts = compoundValue.split("+");
    if (valueParts[overridePropIdx] !== overrideValue) continue;
    if (!dv.pseudo) continue;

    const remainingKey = valueParts
      .filter((_, idx) => idx !== overridePropIdx)
      .join("+");

    for (const [pc, pcStyle] of Object.entries(dv.pseudo)) {
      if (!(cssKey in (pcStyle as Record<string, string | number>))) continue;
      const pcKey = pc as PseudoClass;
      const pcValue = (pcStyle as Record<string, string | number>)[cssKey];

      if (!remainingGroup.has(remainingKey)) {
        remainingGroup.set(remainingKey, { style: {} });
      }
      const target = remainingGroup.get(remainingKey)!;
      if (!target.pseudo) target.pseudo = {};
      if (!target.pseudo[pcKey]) target.pseudo[pcKey] = {};
      target.pseudo[pcKey]![cssKey] = pcValue;
    }
  }
}
```

- [ ] **Step 4: `decomposeMultiProp`에서 호출 추가**

`removeUniformProperties(result, base)` 호출 직후:
```typescript
// 후처리: compound 그룹의 부분 override CSS 속성 분리
this.splitPartialOverrides(result);
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

Run: `npx vitest run test/tree-builder/decomposer-partial-override.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer.ts
git commit -m "feat(decomposer): compound 부분 override 감지 및 CSS 속성 분리"
```

---

## Task 3: JsxGenerator css 배열 순서 — override prop 후배치

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts`
- Test: `test/tree-builder/decomposer-partial-override.test.ts` (확장)

### 문제

현재 css 배열 순서: `[base, sizeStyles, toneStyles, stateStyles, ...]`

state가 style+tone을 override해야 하므로 `stateStyles`가 `styleToneStyles` 뒤에 와야 함.

### 해결

`buildDynamicStyleRef`로 생성되는 참조들의 순서를 조정. compound에서 분리된 prop은 다른 분리 prop보다 뒤에 배치.

구체적으로: `extractDynamicProps`가 반환하는 prop 순서에서, 개별 prop(`state`)이 compound(`style+tone`)보다 뒤에 오도록 정렬.

- [ ] **Step 1: 통합 테스트 추가 — Btnsbtn css 배열 순서**

`test/compiler/test-btnsbtn-decompose.test.ts`에 추가:
```typescript
it("css 배열에서 stateStyles가 styleToneStyles 뒤에 와야 한다 (override 순서)", () => {
  const styleToneIdx = code.indexOf("styleToneStyles");
  const stateIdx = code.indexOf("stateStyles");
  // styleToneStyles가 존재하면 stateStyles보다 먼저 나와야 함 (css 배열 내)
  if (styleToneIdx > -1 && stateIdx > -1) {
    // JSX css={[]} 배열 내에서의 순서 확인
    const cssArray = code.match(/css=\{\[([\s\S]*?)\]\}/);
    if (cssArray) {
      const arrayContent = cssArray[1];
      const stInArray = arrayContent.indexOf("styleToneStyles");
      const stateInArray = arrayContent.indexOf("stateStyles");
      if (stInArray > -1 && stateInArray > -1) {
        expect(stInArray).toBeLessThan(stateInArray);
      }
    }
  }
});
```

- [ ] **Step 2: `extractDynamicProps` 정렬 로직 추가**

compound prop(`style+tone`)을 개별 prop(`state`)보다 먼저 반환하도록 정렬:
```typescript
// compound가 먼저, 개별 prop이 나중 (개별 prop이 compound를 override)
propNames.sort((a, b) => {
  const aIsCompound = a.includes("+");
  const bIsCompound = b.includes("+");
  if (aIsCompound && !bIsCompound) return -1; // compound 먼저
  if (!aIsCompound && bIsCompound) return 1;
  return 0;
});
```

- [ ] **Step 3: 테스트 실행**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts test/compiler/test-btnsbtn-decompose.test.ts
git commit -m "feat(codegen): css 배열에서 override prop을 compound 뒤에 배치"
```

---

## Task 4: 전체 리그레션 검증

- [ ] **Step 1: 전체 테스트 실행**

Run: `npm run test`
Expected: ALL PASS, 0 failures

- [ ] **Step 2: Btnsbtn 생성 코드 수동 확인**

Run: `npx tsx /tmp/compile-em.ts test/fixtures/button/Btnsbtn.json > /tmp/btnsbtn-after.tsx`

확인사항:
1. `sizeStyles`에 background/box-shadow 없음
2. `stateStyles`에 loading의 background + pseudo override 있음
3. `styleToneStyles`에 default의 background + pseudo 있음
4. compound에 border만 남아있음 (또는 compound 자체가 더 작아짐)
5. css 배열에서 styleTone이 state보다 먼저

- [ ] **Step 3: 브라우저 렌더링 확인**

Run: `npm run test:browser` (가능하면)
또는 플러그인 UI에서 Btnsbtn 렌더링하여 시각적 검증

- [ ] **Step 4: Commit**

```bash
git commit -m "test: decomposer partial override 리그레션 검증 완료"
```

---

## 리스크 및 주의사항

1. **pseudo-class 순서**: Emotion css 배열에서 같은 specificity의 pseudo는 나중에 선언된 것이 우선. `stateStyles`가 `styleToneStyles` 뒤에 오면 state의 pseudo가 이겨야 함 → 검증 필요.

2. **다른 컴포넌트 영향**: Btnsbtn 외 다른 fixture에서 compound가 있는 경우도 영향받을 수 있음. 전체 fixture 렌더링 테스트로 리그레션 확인.

3. **`fromPreDecomposed` 경로**: UITreeOptimizer가 이미 decompose한 경우 이 후처리가 실행되는지 확인. `fromPreDecomposed`에도 `splitPartialOverrides` 호출이 필요할 수 있음.

4. **2-prop compound**: 현재 구현은 3-prop 이상에서만 동작. 2-prop compound의 부분 override는 별도 처리 필요 (이 플랜 범위 밖).
