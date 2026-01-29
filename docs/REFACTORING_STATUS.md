# Phase 5: CodeEmitter 리팩토링 현황

## 개요

레거시 `react-generator/`를 완전히 제거하고, 새로운 파이프라인에서 `ReactEmitter`가 `DesignTree`로부터 직접 코드를 생성하도록 리팩토링 진행 중.

## 현재 상태

- **테스트 현황**: 95 failed / 576 passed (총 672개)
- **마지막 커밋**: `0b58250` - 레거시 react-generator 제거 및 동적 스타일 버그 수정

## 완료된 작업

### 1. 레거시 코드 제거 (6,237줄 삭제)

```
삭제된 파일:
├── core/react-generator/
│   ├── ReactGenerator.ts
│   ├── generate-imports/GenerateImports.ts
│   ├── generate-interface/GenerateInterface.ts
│   ├── generate-styles/GenerateStyles.ts
│   ├── generate-component/
│   │   ├── GenerateComponent.ts
│   │   ├── jsx-tree/CreateJsxTree.ts
│   │   └── styeld/CreateStyledComponent.ts
│   └── style-strategy/
│       ├── StyleStrategy.ts
│       ├── EmotionStrategy.ts
│       ├── TailwindStrategy.ts
│       └── index.ts
├── core/Engine.ts
└── core/code-emitter/PolicyMapper.ts
```

### 2. 버그 수정

#### 2.1 Dynamic Variant Styles 버그
**문제**: Size prop에 따른 fontSize 변경이 동작하지 않음 (항상 16px)

**원인 분석**:
1. `StyleProcessor.classifyStyles`: 모든 variant에 State가 있어서 스타일이 pseudo-class로만 분류됨
2. `EmotionStyleStrategy.extractCondition`: 복합 LogicalExpression 처리 불가
3. `VisibilityProcessor.parseVariantCondition`: `value.toLowerCase()`로 대소문자 불일치

**수정 내용**:

```typescript
// StyleProcessor.ts (207-234줄)
// Before: State가 있으면 무조건 pseudo로 분류
// After: non-State 조건이 있으면 dynamic에도 추가
const condition = parseCondition(vs.variantName);
if (condition) {
  dynamic.push({ condition, style: dynamicStyle });
} else if (pseudoClass) {
  pseudo[pseudoClass] = { ...pseudo[pseudoClass], ...dynamicStyle };
}
```

```typescript
// EmotionStyleStrategy.ts (468-535줄)
// Before: BinaryExpression만 처리
// After: LogicalExpression 재귀 탐색 추가
private extractFromLogicalExpression(logicalExpr: any): ExtractedCondition | null {
  if (logicalExpr.left?.type === "BinaryExpression") {
    return this.extractFromBinaryExpression(logicalExpr.left);
  }
  if (logicalExpr.left?.type === "LogicalExpression") {
    return this.extractFromLogicalExpression(logicalExpr.left);
  }
  // ...
}
```

```typescript
// VisibilityProcessor.ts (138줄)
// Before: value.toLowerCase()
// After: value (원본 대소문자 유지)
conditions.push(this.createBinaryCondition(toCamelCase(key), value));
```

#### 2.2 외부 컴포넌트 이름 불일치 버그
**문제**: `SizeNormal`, `SizeLarge` 등 variant 이름이 컴포넌트명으로 사용됨

**수정**: `InstanceProcessor.buildExternalRef`에서 ComponentSet 이름 조회
```typescript
// componentSetId가 있으면 componentSets에서 이름 조회
if (componentSetId) {
  const componentSetInfo = componentSets?.[componentSetId];
  componentName = componentSetInfo?.name || depData.info.document?.name || nodeName;
}
```

## 남은 이슈 (95개 테스트 실패)

### 카테고리별 분류

| 카테고리 | 설명 | 예상 난이도 |
|---------|------|-----------|
| **Slot 감지** | visibility에 따라 변하는 INSTANCE가 slot이 되어야 함 | 높음 |
| **Prop 이름 충돌** | `disabled` → `customDisabled` 변환 | 중간 |
| **아이콘/SVG 렌더링** | INSTANCE 노드가 빈 div로 렌더링됨 | 높음 |
| **Array Slot** | `.map()` 렌더링이 동작하지 않음 | 중간 |
| **State 조건부 visible** | CSS 변환 불가능한 State 처리 | 중간 |
| **Tailwind CSS** | 클래스 변환 테스트들 | 낮음 |

### 주요 실패 테스트 예시

```
× 세 개의 slot이 모두 생성되어야 한다
× slot이 JSX에서 올바르게 렌더링되어야 한다
× Left Icon과 Right Icon이 렌더링 되어야 한다
× prop에서 nativeProp과 겹치는 prop이 있으면 custom prop으로 이름이 변경된다
× BOOLEAN_OPERATION 노드가 SVG로 렌더링되어야 한다
× 생성된 코드에 .map() 렌더링이 포함되어야 한다
```

## 파일 구조 (현재)

```
src/frontend/ui/domain/compiler/
├── core/
│   ├── data-preparer/          # Phase 3: 데이터 준비
│   ├── tree-builder/           # Phase 4: DesignTree 생성
│   │   └── workers/
│   │       ├── StyleProcessor.ts      ✅ 수정됨
│   │       ├── VisibilityProcessor.ts ✅ 수정됨
│   │       ├── InstanceProcessor.ts   ✅ 수정됨
│   │       └── ...
│   └── code-emitter/           # Phase 5: 코드 생성
│       ├── ReactEmitter.ts
│       ├── generators/
│       │   ├── ComponentGenerator.ts
│       │   ├── InterfaceGenerator.ts
│       │   ├── StylesGenerator.ts
│       │   └── ImportsGenerator.ts
│       ├── style-strategy/
│       │   ├── EmotionStyleStrategy.ts ✅ 수정됨
│       │   └── TailwindStyleStrategy.ts
│       └── utils/
│           └── SvgToJsx.ts     # 이동됨
├── types/
│   ├── architecture.ts
│   └── customType.ts
└── index.ts
```

## 다음 단계

1. **Slot 감지 로직 구현**
   - `SlotProcessor`에서 visibility 기반 slot 감지
   - INSTANCE → `{slotName}` 렌더링

2. **Prop 이름 충돌 해결**
   - HTML 네이티브 속성과 충돌하는 prop 이름 변경
   - `disabled` → `customDisabled`

3. **SVG/아이콘 렌더링**
   - BOOLEAN_OPERATION → SVG 변환
   - 아이콘 INSTANCE 처리

4. **Array Slot 구현**
   - 반복되는 INSTANCE 패턴 감지
   - `.map()` 렌더링 생성

## 테스트 실행

```bash
# 전체 테스트
npm run test

# 특정 테스트
npm run test -- test/compiler/compiler.test.ts -t "Size가 Medium"

# 디버그 테스트
npm run test -- test/compiler/debug-variant-styles.test.ts
```

## 관련 커밋

```
0b58250 refactor(code-emitter): 레거시 react-generator 제거 및 동적 스타일 버그 수정
900d6c0 refactor(code-emitter): Phase 5 CodeEmitter 리팩토링 완료
c91364a docs: Phase 4 리팩토링 완료 상태 업데이트
```

---
*마지막 업데이트: 2026-01-29*
