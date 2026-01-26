# Figma Compiler Engine 기술 문서

> Figma 디자인 데이터를 React 컴포넌트 코드로 변환하는 컴파일러 엔진의 내부 구조 및 알고리즘 정리

## 목차

1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [데이터 구조](#데이터-구조)
4. [컴파일 파이프라인](#컴파일-파이프라인)
5. [핵심 알고리즘](#핵심-알고리즘)
6. [매니저 클래스](#매니저-클래스)
7. [코드 생성](#코드-생성)
8. [해결된 이슈](#해결된-이슈)
9. [테스트](#테스트)

---

## 개요

### 목적

Figma Plugin API를 통해 추출한 디자인 데이터(`FigmaNodeData`)를 입력받아, TypeScript React 컴포넌트 코드를 출력합니다.

### 지원 범위

- **노드 타입**: FRAME, TEXT, RECTANGLE, ELLIPSE, VECTOR, COMPONENT, COMPONENT_SET, INSTANCE, GROUP
- **기능**: Variant 지원, Props 자동 추출, 외부 컴포넌트 의존성, 배열 슬롯
- **스타일**: Emotion CSS-in-JS, TailwindCSS

---

## 아키텍처

### 클래스 구조

```
FigmaCodeGenerator (Facade)
├── SpecDataManager          # 데이터 접근/조회
├── PropsManager             # Props 추출/포맷팅
│   └── PropsExtractor       # 원본 데이터에서 Props 추출
├── InstanceOverrideManager  # INSTANCE 오버라이드 병합
├── VariantEnrichManager     # Variant 데이터 보강
├── DependencyManager        # 의존성 컴파일/번들링
└── Engine                   # 컴파일 파이프라인 실행
    ├── CreateSuperTree      # Variant 병합 트리 생성
    ├── CreateAstTree        # AST 트리 생성
    │   ├── _TempAstTree     # Props 바인딩
    │   └── _FinalAstTree    # 조건부 렌더링 처리
    ├── ArraySlotDetector    # 배열 슬롯 감지
    └── ReactGenerator       # 코드 생성
        ├── GenerateImports
        ├── GenerateInterface
        ├── GenerateStyles
        └── GenerateComponent
```

### 파일 구조

```
src/frontend/ui/domain/compiler/
├── FigmaCodeGenerator.ts           # 진입점 (Facade)
├── index.ts                   # 타입 export
├── core/
│   ├── Engine.ts              # 파이프라인 조율
│   ├── NodeMatcher.ts         # 노드 동일성 판별
│   ├── ArraySlotDetector.ts   # 배열 슬롯 감지
│   ├── super-tree/
│   │   ├── CreateSuperTree.ts
│   │   └── squash/
│   ├── ast-tree/
│   │   ├── CreateAstTree.ts
│   │   ├── _TempAstTree.ts
│   │   └── _FinalAstTree.ts
│   └── react-generator/
│       ├── ReactGenerator.ts
│       ├── generate-imports/
│       ├── generate-interface/
│       ├── generate-styles/
│       ├── generate-component/
│       └── style-strategy/
├── manager/
│   ├── SpecDataManager.ts
│   ├── PropsManager.ts
│   ├── PropsExtractor.ts
│   ├── InstanceOverrideManager.ts
│   ├── VariantEnrichManager.ts
│   └── DependencyManager.ts
├── types/
│   ├── baseType.ts
│   └── customType.ts
└── utils/
    ├── normalizeString.ts
    ├── traverse.ts
    └── ...
```

---

## 데이터 구조

### 입력: FigmaNodeData

```typescript
interface FigmaNodeData {
  info: {
    document: SceneNode; // Figma 노드 트리
    components: Record<string, any>; // 컴포넌트 메타데이터
  };
  styleTree: RenderTree; // CSS 스타일 정보
  dependencies?: Record<string, FigmaNodeData>; // 외부 컴포넌트
  imageUrls?: Record<string, string>; // 이미지 URL 매핑
}
```

### RenderTree (styleTree)

```typescript
interface RenderTree {
  id: string;
  name: string;
  cssStyle: Record<string, string>; // CSS 속성
  children: RenderTree[];
}
```

### SuperTreeNode

```typescript
interface SuperTreeNode {
  id: string;
  type: string;
  name: string;
  parent: SuperTreeNode | null;
  children: SuperTreeNode[];
  mergedNode: Array<{
    // 병합된 Variant 노드들
    id: string;
    name: string;
    variantName: string | null;
  }>;
  metaData: {
    originSiblingIndex: number;
    spec: SceneNode;
  };
}
```

### FinalAstTree

```typescript
interface FinalAstTree {
  id: string;
  type: string;
  name: string;
  children: FinalAstTree[];
  props: PropsDef; // 컴포넌트 Props
  isSlot?: boolean; // 슬롯 여부
  slotName?: string;
  externalComponent?: {
    // 외부 컴포넌트 참조
    componentSetId: string;
    componentName: string;
  };
  conditionalRender?: {
    // 조건부 렌더링
    propName: string;
    conditions: Array<{ value: string; visible: boolean }>;
  };
  metaData: {
    document: SceneNode;
    cssStyle: Record<string, string>;
  };
}
```

---

## 컴파일 파이프라인

### 전체 흐름

```
[FigmaNodeData]
│
├── info.document ─────────────────────┐
│   (SceneNode 트리, 노드 구조)          │
│                                       ▼
└── styleTree ──────────────────► [SpecDataManager]
    (RenderTree, CSS 스타일)             │
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
            [PropsExtractor]                        [CreateSuperTree]
            Props 정의 추출                          Variant 병합
                    │                                       │
                    ▼                                       ▼
            [refinedProps]                          [SuperTree]
                    │                                       │
                    └───────────────┬───────────────────────┘
                                    ▼
                            [CreateAstTree]
                            ├── _TempAstTree (Props 바인딩)
                            └── _FinalAstTree (조건부 렌더링)
                                    │
                                    ▼
                            [FinalAstTree]
                                    │
                                    ▼
                            [ReactGenerator]
                            ├── GenerateImports
                            ├── GenerateInterface
                            ├── GenerateStyles
                            └── GenerateComponent
                                    │
                                    ▼
                            [TypeScript AST]
                            (ts.factory 생성)
                                    │
                                    ▼
                            [ts.Printer]
                                    │
                                    ▼
                            [Prettier]
                                    │
                                    ▼
                            [React Component Code]
```

### 단계별 설명

| 단계 | 클래스          | 입력              | 출력         | 역할                                           |
| ---- | --------------- | ----------------- | ------------ | ---------------------------------------------- |
| 1    | SpecDataManager | FigmaNodeData     | -            | 데이터 접근 레이어, HashMap 구축               |
| 2    | PropsExtractor  | SpecDataManager   | PropsDef     | componentPropertyDefinitions에서 Props 추출    |
| 3    | CreateSuperTree | RenderTree        | SuperTree    | COMPONENT_SET의 Variant들을 하나의 트리로 병합 |
| 4    | \_TempAstTree   | SuperTree + Props | TempAstTree  | Props 바인딩, 스타일 주입                      |
| 5    | \_FinalAstTree  | TempAstTree       | FinalAstTree | 조건부 렌더링 처리, 노드 정리                  |
| 6    | ReactGenerator  | FinalAstTree      | TS AST       | TypeScript AST 노드 생성                       |
| 7    | ts.Printer      | TS AST            | string       | AST → 코드 문자열 변환                         |
| 8    | Prettier        | string            | string       | 코드 포맷팅                                    |

---

## 핵심 알고리즘

### 1. SuperTree 병합 (BFS 기반)

**목적**: COMPONENT_SET의 여러 Variant를 하나의 트리로 병합

**알고리즘**:

1. 첫 번째 Variant를 pivot으로 설정
2. 나머지 Variant를 BFS로 순회하면서 병합
3. 같은 depth에서 동일 노드를 찾아 `mergedNode`에 추가
4. 새로운 노드는 부모를 찾아 children에 추가

```typescript
private _mergeTree(pivotSuperTree: SuperTreeNode, targetTree: SuperTreeNode) {
  traverseBFS(targetTree, (targetNode, targetMeta) => {
    // 1. 같은 depth에서 동일 노드 찾기
    const sameDepthNodes = getNodesAtDepth(pivotSuperTree, targetMeta.depth);
    const pivotMatchedNode = sameDepthNodes.find((pivot) =>
      this.matcher.isSameNode(targetNode, pivot)
    );

    if (pivotMatchedNode) {
      // 같은 노드면 mergedNode에 추가
      pivotMatchedNode.mergedNode.push(...targetNode.mergedNode);
      return;
    }

    // 2. 부모 노드 찾아서 children에 추가
    const parentDepthNodes = getNodesAtDepth(pivotSuperTree, targetMeta.depth - 1);
    const matchedParent = parentDepthNodes.find((pivot) =>
      this.matcher.isSameNode(targetNode.parent!, pivot)
    );

    if (matchedParent) {
      nodesToAdd.push({ parent: matchedParent, node: targetNode });
    }
  });

  // 순회 후 한꺼번에 추가 (순회 중 수정 방지)
  for (const { parent, node } of nodesToAdd) {
    parent.children.push(node);
  }
}
```

**시간 복잡도**: O(V × N × M)

- V: Variant 수
- N: pivot 트리 노드 수
- M: target 트리 노드 수

---

### 2. IoU (Intersection over Union) 노드 매칭

**목적**: 서로 다른 Variant에서 "같은" 노드인지 판별

**문제**: Figma는 Variant마다 다른 노드 ID를 부여하므로 ID 비교 불가

**해결**: 위치 기반 유사도 측정 (컴퓨터 비전 알고리즘 차용)

```typescript
private _calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
  // 교집합 영역
  const xOverlap = Math.max(0,
    Math.min(box1.x + box1.width, box2.x + box2.width) -
    Math.max(box1.x, box2.x)
  );
  const yOverlap = Math.max(0,
    Math.min(box1.y + box1.height, box2.y + box2.height) -
    Math.max(box1.y, box2.y)
  );
  const intersectionArea = xOverlap * yOverlap;

  // 합집합 영역
  const unionArea = area1 + area2 - intersectionArea;

  return intersectionArea / unionArea;  // 0 ~ 1
}
```

**임계값**:

- 일반 노드: IoU >= 0.8
- TEXT 노드: IoU >= 0.1 (텍스트 길이에 따라 크기 변동)

---

### 3. 구조적 패턴 매칭

**목적**: Auto Layout Frame에서 반복 패턴 감지

```typescript
private _getChildPattern(node: FrameNode): string {
  const types = node.children.map((child) => child.type);

  // 주기적 패턴 찾기
  for (let patternLen = 1; patternLen <= types.length / 2; patternLen++) {
    if (types.length % patternLen !== 0) continue;

    const pattern = types.slice(0, patternLen);
    let isRepeating = true;

    for (let i = patternLen; i < types.length; i += patternLen) {
      const chunk = types.slice(i, i + patternLen);
      if (chunk.join("-") !== pattern.join("-")) {
        isRepeating = false;
        break;
      }
    }

    if (isRepeating) return `(${pattern.join("-")})+`;
  }

  return types.join("-");
}
```

**예시**:

- `[FRAME, TEXT, FRAME, TEXT]` → `(FRAME-TEXT)+`
- `[TEXT, FRAME, IMAGE]` → `TEXT-FRAME-IMAGE`

---

### 4. 배열 슬롯 감지

**감지 조건**:

1. 같은 부모 아래에
2. 2개 이상의 INSTANCE가
3. 같은 **componentId**를 참조하고 (정확히 같은 Variant만)
4. componentPropertyReferences.visible이 없으면

→ 배열 슬롯으로 처리

**중요**: `componentSetId`가 아닌 `componentId`로 그룹핑해야 함. 같은 ComponentSet의 다른 Variant들(예: Neutral vs Primary 버튼)이 잘못 묶이는 것을 방지.

```typescript
private groupInstancesByComponent(instances: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const instance of instances) {
    // componentId로 그룹핑 (정확히 같은 Variant만)
    const componentId = instance.componentId;
    const key = `componentId:${componentId}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(instance);
  }
  return groups;
}

private detectArraySlotInChildren(parentNode: any): ArraySlot | null {
  const instances = parentNode.children.filter(
    (child) => child.type === "INSTANCE" && child.visible !== false
  );

  if (instances.length < 2) return null;

  // componentId로 그룹핑
  const groups = this.groupInstancesByComponent(instances);

  for (const [key, groupInstances] of Object.entries(groups)) {
    if (groupInstances.length < 2) continue;

    // visible 바인딩이 있는 INSTANCE 제외
    const validInstances = groupInstances.filter(
      (instance) => !instance.componentPropertyReferences?.visible
    );

    if (validInstances.length >= 2) {
      return { parentId, slotName, componentId, instances: validInstances, ... };
    }
  }
}
```

### 5. SuperTree 병합 후 ArraySlot 매칭

**문제**: ArraySlot의 `parentId`가 원본 Figma variant 노드 ID인데, AST는 병합된 SuperTree에서 생성되어 ID가 다름.

```
예:
- ArraySlot parentId: 133:791 (variant "Size=default, Options=3 options")
- AST root ID: 133:737 (대표 variant "Size=default, Options=2 options")
```

**해결**: `CreateJsxTree._findArraySlotForNode()`에서 children ID로 매칭:

```typescript
private _findArraySlotForNode(node: FinalAstTree): ArraySlot | undefined {
  // 1. parentId로 직접 매칭 (기존 로직)
  const directMatch = this.arraySlotByParentId.get(node.id);
  if (directMatch) {
    return directMatch;
  }

  // 2. children의 ID로 매칭
  for (const slot of this.arraySlots) {
    const instanceIds = new Set(slot.instances.map((i) => i.id));

    // 현재 노드의 children 중 ArraySlot instance가 있는지 확인
    for (const child of node.children) {
      if (instanceIds.has(child.id)) {
        return slot;
      }

      // externalComponent의 componentId로도 확인
      if (child.externalComponent) {
        const extCompId = child.externalComponent.componentId;
        if (slot.componentId && extCompId === slot.componentId) {
          return slot;
        }
      }
    }
  }

  return undefined;
}
```

**결과**: 병합된 SuperTree에서도 ArraySlot이 정상적으로 `.map()` 형태로 렌더링됨.

---

### 6. INSTANCE 오버라이드 병합

**문제**: INSTANCE의 children ID는 `I704:56;704:29;692:1613` 형식으로 원본 ID와 다름

**해결**: 마지막 세그먼트가 원본 ID

```typescript
// I704:56;704:29;692:1613 → 692:1613
private _getOriginalId(instanceId: string): string {
  if (!instanceId.startsWith("I")) return instanceId;
  const parts = instanceId.split(";");
  return parts[parts.length - 1];
}
```

**병합 로직**:

```typescript
private mergeInstanceOverrides(variantChildren, instanceChildren) {
  // 원본 ID로 매핑
  const overrideMap = new Map();
  for (const child of instanceChildren) {
    const originalId = this._getOriginalId(child.id);
    overrideMap.set(originalId, child);
  }

  // 실제로 변경된 속성만 오버라이드
  return variantChildren.map((child) => {
    const override = overrideMap.get(child.id);
    if (override?.characters !== child.characters) {
      return { ...child, characters: override.characters };
    }
    return child;
  });
}
```

---

## 매니저 클래스

### SpecDataManager

데이터 접근 레이어. HashMap으로 O(1) 조회 제공.

```typescript
class SpecDataManager {
  private specHashMap: Record<string, SceneNode>;
  private renderTreeHashMap: Record<string, RenderTree>;

  getSpecById(id: string): SceneNode;
  getRenderTreeById(id: string): RenderTree;
  getComponentPropertyDefinitions(): PropsDef | null;
  getDependencies(): Record<string, FigmaNodeData>;
  getDependenciesGroupedByComponentSet(): GroupedDeps;
}
```

### PropsManager

Props 도메인 통합 관리. PropsExtractor를 내부적으로 사용.

```typescript
class PropsManager {
  private extractor: PropsExtractor;

  // 추출 단계 (AST 생성용)
  get extractedProps(): PropsDef;

  // 포맷팅 단계 (UI용)
  getPropsDefinition(astTree, normalizeComponentName): PropDefinition[];
}
```

### DependencyManager

외부 컴포넌트 의존성 컴파일 및 번들링.

```typescript
class DependencyManager {
  // 의존성 컴파일
  compileWithDependencies(
    mainCode,
    name,
    compilerFactory
  ): MultiComponentResult;

  // 번들링 (import 정리, 변수명 충돌 해결)
  bundleWithDependencies(result, rootDocument): string;
}
```

---

## 코드 생성

### ReactGenerator 구조

```typescript
class ReactGenerator {
  private GenerateImports: GenerateImports; // import 문
  private GenerateInterface: GenerateInterface; // Props 인터페이스
  private GenerateStyles: GenerateStyles; // 스타일 변수
  private GenerateComponent: GenerateComponent; // 컴포넌트 함수
  private styleStrategy: StyleStrategy; // Emotion/Tailwind

  async generateComponentCode(componentName): Promise<string>;
}
```

### 스타일 전략 (Strategy Pattern)

```typescript
interface StyleStrategy {
  name: string;
  generateImports(): ts.ImportDeclaration[];
  generateDeclarations(astTree, componentName): ts.Statement[];
  generateStyleAttribute(node): ts.JsxAttribute | null;
}

// 구현체
class EmotionStrategy implements StyleStrategy { ... }
class TailwindStrategy implements StyleStrategy { ... }
```

### TailwindStrategy CSS-to-Tailwind 변환

TailwindStrategy는 외부 라이브러리 없이 CSS 속성을 Tailwind 클래스로 직접 변환합니다.

#### 변환 방식

| 변환 유형 | 예시 | 설명 |
| --------- | ---- | ---- |
| 정확한 값 매핑 | `display: flex` → `flex` | `CSS_TO_TAILWIND_MAP`에서 조회 |
| 특수 값 처리 | `width: 100%` → `w-full` | `_handleSpecialValues()`에서 처리 |
| Arbitrary value | `width: 375px` → `w-[375px]` | `CSS_PROPERTY_TO_TAILWIND_PREFIX`로 접두사 결정 |
| Arbitrary property | `font-weight: 700` → `[font-weight:700]` | 매핑 없는 속성 |

#### CSS_TO_TAILWIND_MAP

정확히 일치하는 CSS 속성+값을 Tailwind 클래스로 매핑:

```typescript
const CSS_TO_TAILWIND_MAP = {
  display: { flex: "flex", "inline-flex": "inline-flex", none: "hidden", ... },
  position: { absolute: "absolute", relative: "relative", fixed: "fixed", ... },
  "justify-content": { center: "justify-center", "flex-start": "justify-start", ... },
  "align-items": { center: "items-center", "flex-start": "items-start", ... },
  overflow: { hidden: "overflow-hidden", visible: "overflow-visible", ... },
  // ... 40+ 속성 매핑
};
```

#### CSS_PROPERTY_TO_TAILWIND_PREFIX

Arbitrary value 생성 시 사용할 Tailwind 접두사:

```typescript
const CSS_PROPERTY_TO_TAILWIND_PREFIX = {
  width: "w",          // width: 375px → w-[375px]
  height: "h",         // height: 44px → h-[44px]
  padding: "p",        // padding: 16px → p-[16px]
  margin: "m",         // margin: 8px → m-[8px]
  top: "top",          // top: 13px → top-[13px]
  left: "left",        // left: 23px → left-[23px]
  "border-radius": "rounded",  // border-radius: 8px → rounded-[8px]
  "font-size": "text", // font-size: 15px → text-[15px]
  gap: "gap",          // gap: 16px → gap-[16px]
  // ... 30+ 속성
};
```

#### 특수 케이스 처리

**1. rgba/hsla 색상 값**

```typescript
// 잘못된 변환 (이전): rgba(0, 0, 0, 0.38) → bg-[rgba(0] (잘림)
// 올바른 변환 (현재): rgba(0, 0, 0, 0.38) → bg-[rgba(0,_0,_0,_0.38)]

if (/^(rgba?\([^)]+\)|hsla?\([^)]+\))$/i.test(valueStr)) {
  return `bg-[${this._escapeArbitraryValue(valueStr)}]`;
}
```

**2. CSS 변수**

```typescript
// var(--Static-White, #FFF) → [background-color:var(--Static-White,_#FFF)]

if (valueStr.startsWith("var(")) {
  return `[background-color:${this._escapeArbitraryValue(valueStr)}]`;
}
```

**3. 특수 값 (100%, auto, 0)**

```typescript
// width: 100% → w-full (not w-[100%])
// height: auto → h-auto (not h-[auto])
// top: 0 → top-0 (not top-[0])
```

#### 이스케이프 규칙

Tailwind arbitrary value에서:
- 공백 → `_` (언더스코어)
- 기존 `_` → `\_` (이스케이프)
- 따옴표 제거

```typescript
_escapeArbitraryValue(value: string): string {
  return value
    .replace(/_/g, "\\_")      // 기존 _ 이스케이프
    .replace(/\s+/g, "_")      // 공백 → _
    .replace(/['"]/g, "");     // 따옴표 제거
}
```

#### 테스트

`test/compiler/styleStrategy.test.ts` - "TailwindStrategy CSS-to-Tailwind 변환 테스트"

### 출력 코드 구조

```typescript
// 1. Imports
import { css } from "@emotion/react";

// 2. Props Interface
export interface ButtonProps {
  variant?: "primary" | "secondary";
  label?: string;
  onClick?: () => void;
}

// 3. Styles
const containerStyle = css`
  display: flex;
  padding: 12px 24px;
`;

// 4. Component
export const Button = ({ variant = "primary", label, onClick }: ButtonProps) => {
  return (
    <button css={containerStyle} onClick={onClick}>
      {label}
    </button>
  );
};

export default Button;
```

---

## 해결된 이슈

### 1. flex-basis: 0과 padding 충돌

#### 문제

Figma의 `getCSSAsync()`가 `flex: 1 0 0` (flex-basis: 0)을 반환하면, padding이 있는 형제 요소들의 크기가 불균등해지는 문제.

```
Figma 원본:
┌─────────────────────────────────────────┐
│ Cell1 (480px)      │ Cell2 (480px)      │
│ padding-left: 479px│ padding: 0         │
└─────────────────────────────────────────┘

잘못된 렌더링 (flex: 1 0 0):
┌─────────────────────────────────────────┐
│ Cell1 (719px)           │ Cell2 (241px) │
└─────────────────────────────────────────┘
```

#### 원인

- CSS flex에서 `flex-basis: 0`이면 모든 공간이 균등 분배됨
- 하지만 padding은 content box에 추가되어 최종 크기에 영향
- 결과적으로 padding 차이만큼 크기가 불균등해짐

#### 해결

`_TempAstTree.updateFlexWithPadding()`에서 `flex-basis: 0`을 실제 Figma 크기로 수정:

```typescript
// Before: flex: 1 0 0
// After:  flex: 1 0 480px

const match = flexValue.match(/^(\d+)\s+(\d+)\s+0$/);
if (match) {
  const [, flexGrow, flexShrink] = match;
  const width = nodeSpec?.absoluteBoundingBox?.width;
  base["flex"] = `${flexGrow} ${flexShrink} ${width}px`;
}
```

#### 테스트

`test/compiler/flexPaddingFix.test.ts`

---

### 2. INSTANCE wrapper 크기 누락

#### 문제

외부 컴포넌트(INSTANCE)의 wrapper div에 `width/height`가 누락되어, 자식 컴포넌트의 `width: 100%; height: 100%`가 제대로 동작하지 않음.

```jsx
// 문제: wrapper에 크기 없음
<div style={{ position: "absolute", left: "220px", top: "100px" }}>
  <Ghost /> // Ghost CSS: width: 100%, height: 100% → 크기 0
</div>
```

#### 원인

- Figma `getCSSAsync()`가 INSTANCE에 width/height를 반환하지 않음
- wrapper div에 크기가 없어서 자식의 100% 스타일이 동작 안 함

#### 해결

1. `_FinalAstTree.updateMetaData()`에서 INSTANCE에 `spec` 저장:

```typescript
case "INSTANCE": {
  const instanceSpec = this.specDataManager.getSpecById(node.id);
  if (instanceSpec) {
    node.metaData.spec = instanceSpec;  // absoluteBoundingBox 포함
  }
}
```

1. `CreateJsxTree._createExternalComponentJsx()`에서 wrapper에 크기 적용:

```typescript
const boundingBox = node.metaData?.spec?.absoluteBoundingBox;
if (boundingBox) {
  layoutStyles["width"] = `${boundingBox.width}px`;
  layoutStyles["height"] = `${boundingBox.height}px`;
}
```

#### 테스트

`test/compiler/flexPaddingFix.test.ts`

---

### 3. FRAME에서 ArraySlot 감지

#### 문제

FRAME 내부의 동일 컴포넌트 INSTANCE들이 ArraySlot으로 감지되어 `.map()` 형태로 렌더링됨. 사용자는 정적 렌더링을 원함.

#### 해결

`ArraySlotDetector.detect()`에서 COMPONENT_SET/COMPONENT만 ArraySlot 감지:

```typescript
if (document.type !== "COMPONENT_SET" && document.type !== "COMPONENT") {
  return []; // FRAME, SECTION 등은 정적 렌더링
}
```

#### 테스트

`test/compiler/arraySlot.test.ts`

---

### 4. SVG 아이콘 색상이 State별로 다름

#### 문제

Figma에서 `State=Disabled`일 때 아이콘 색이 연한 회색(#CACACA), `State=Default`일 때 진한 회색(#4B4B4B)인데, 컴파일된 코드에서는 항상 같은 색으로 렌더링됨.

```tsx
// 문제: 모든 State에서 아이콘 색이 같음
<path fill="#CACACA" ... />
```

#### 원인

- 각 variant의 SVG에 하드코딩된 fill 색상 사용
- State에 따라 동적으로 변경되지 않음

#### 해결

1. SVG `fill` 속성을 `currentColor`로 변환 (`SvgToJsx._createJsxAttributes()`):

```typescript
if (attrName === "fill" && this._isColorValue(attrValue)) {
  finalValue = "currentColor";
}
```

1. 부모 요소에 CSS `color` 속성 추가 (`_FinalAstTree.updateSvgFillToColor()`):

```typescript
// mergedNode에서 각 variant의 자식 SVG fill 색상 추출
// Default variant → base color
// Disabled variant → :disabled pseudo color
astTree.style.base = { ...astTree.style.base, color: "#4B4B4B" };
astTree.style.pseudo[":disabled"] = { color: "#CACACA" };
```

#### 결과

```css
button {
  color: #4b4b4b; /* 기본 아이콘 색 */
}
button:disabled {
  color: #cacaca; /* Disabled 아이콘 색 */
}
```

#### 테스트

`test/compiler/ghost-analysis.test.ts`

---

### 5. Pseudo-class 순서 및 :disabled 상태 처리

#### 문제

1. **`:disabled` 버튼도 `:hover` 효과 적용됨**: disabled 상태에서 마우스 올리면 배경색 변경
2. **`:active`가 `:hover`에 덮어씌워짐**: 클릭해도 hover 색상만 보임

#### 원인

```css
/* 잘못된 순서 */
:active {
  background: #e1e1e1;
}
:hover {
  background: #f5f5f5;
} /* active를 덮어씀 */
```

CSS에서 같은 우선순위면 나중에 정의된 것이 적용. 클릭 시 `:hover`와 `:active`가 동시에 true이므로 `:hover`가 우선됨.

#### 해결

`GenerateStyles._pseudoStyleToCssString()`에서:

1. `:hover`, `:active`를 `&:not(:disabled)`로 감싸기
2. pseudo-class 순서 정렬: hover → focus → active → disabled

```typescript
// 순서 정렬
const pseudoOrder = [":hover", ":focus", ":active", ":disabled"];
const sortedEntries = Object.entries(pseudo).sort(...);

// :not(:disabled) 적용
if (hasDisabled && (pseudoClass === ":hover" || pseudoClass === ":active")) {
  finalPseudoClass = `&:not(:disabled)${pseudoClass}`;
}
```

#### 결과

```css
&:not(:disabled):hover {
  background: #f5f5f5;
} /* 먼저 */
&:not(:disabled):active {
  background: #e1e1e1;
} /* 나중 - hover를 덮어씀 */
:disabled {
  color: #cacaca;
}
```

---

### 6. 회전된 요소 (transform: rotate) 레이아웃 처리

#### 문제

Figma에서 `transform: rotate(-90deg)` 등으로 회전된 요소가 CSS에서 잘못 렌더링됨.

```
Figma 원본:
┌────┐
│ T  │  ← 상단 16px 가로선 (회전된 FRAME)
│ |  │  ← 10px 세로선 (회전된 VECTOR)
│40px│  ← 텍스트
│ |  │
│ ⊥  │  ← 하단 16px 가로선
└────┘

잘못된 렌더링:
└── "40px"만 보임 (회전된 요소 안 보임)
```

#### 원인

1. CSS `transform: rotate()`는 **시각적 변환만** 수행
2. **레이아웃 계산에는 영향 없음** → flex 공간 할당이 회전 전 크기 기준
3. `absoluteBoundingBox`는 회전 전 크기, `absoluteRenderBounds`는 회전 후 실제 크기

#### 해결

`_TempAstTree.updateRotatedElements()`에서:

1. ±90도 회전 감지 (rotation ≈ ±π/2)
2. `transform: rotate()` 제거
3. `absoluteRenderBounds` 기반 실제 크기 설정

```typescript
// rotation 감지
const isRotated90 = Math.abs(absRotation - Math.PI / 2) < 0.01;

if (isRotated90) {
  delete base["transform"];
  base["width"] = `${Math.round(renderBounds.width)}px`;
  base["height"] = `${Math.round(renderBounds.height)}px`;
  base["flex"] = `${flexGrow} ${flexShrink} auto`; // flex-basis 유지
}
```

`_TempAstTree.updateVectorStyles()`에서:

- VECTOR 노드는 항상 `absoluteRenderBounds` 기반 크기 설정
- 부모가 회전된 경우에도 정확한 렌더링 크기 제공

#### 결과

```jsx
// 이전: 회전된 상태로 레이아웃 충돌
<div style={{ height: "16px", transform: "rotate(-90deg)" }}>
  <svg width={16} height={1} ... />
</div>

// 이후: 실제 렌더링 크기로 설정
<div style={{ height: "1px", width: "16px" }}>
  <svg width={16} height={1} ... />
</div>
```

---

### 7. 인스턴스 오버라이드를 Props로 전달 (CSS 변수 방식)

#### 문제

Figma에서 동일한 컴포넌트(ColorGuide)의 여러 INSTANCE가 각각 다른 배경색/텍스트를 가지는데, 컴파일 시 하나의 컴포넌트로 생성되어 인스턴스별 오버라이드가 반영되지 않음.

```
Figma 원본:
┌─────────┬─────────┬─────────┐
│ #FFFFFF │ #D6D6D6 │ #B2B2B2 │  ← 각각 다른 배경색
│  "100"  │  "90"   │  "80"   │  ← 각각 다른 텍스트
└─────────┴─────────┴─────────┘

잘못된 렌더링:
┌─────────┬─────────┬─────────┐
│ #FFFFFF │ #FFFFFF │ #FFFFFF │  ← 모두 같은 배경색
│  "100"  │  "100"  │  "100"  │  ← 모두 같은 텍스트
└─────────┴─────────┴─────────┘
```

#### 원인

- 의존 컴포넌트(ColorGuide)가 기본 variant 정보만 가지고 있음
- 각 INSTANCE의 오버라이드 정보가 전달되지 않음

#### 해결

**1단계: 오버라이드 추출 (`DependencyManager._collectAllOverrideableProps`)**

각 INSTANCE의 children과 기본 variant의 children을 비교하여 오버라이드된 속성 추출:

```typescript
// INSTANCE children vs Variant children 비교
if (instanceChild.fills !== variantChild.fills) {
  overrideProps["rectangle1Bg"] = instanceChild.fills; // #D6D6D6
}
if (instanceChild.characters !== variantChild.characters) {
  overrideProps["aaText"] = instanceChild.characters; // "90"
}
```

**2단계: CSS 변수 적용 (`_FinalAstTree._applyOverrideableCssVariables`)**

의존 컴포넌트의 CSS에서 오버라이드 가능한 속성을 CSS 변수로 변경:

```typescript
// Before: background: var(--Neutral-100, #FFF)
// After:  background: var(--rectangle1-bg, var(--Neutral-100, #FFF))

const cssVarName = `--${nodeName}-bg`;
targetNode.style.base.background = `var(${cssVarName}, ${originalBg})`;
```

**3단계: Props 인터페이스 생성 (`GenerateInterface`)**

```typescript
export interface ColorGuideProps {
  rectangle1Bg?: string; // fills 오버라이드
  aaBg?: string; // fills 오버라이드
  aaText?: string | React.ReactNode; // characters 오버라이드
  children?: React.ReactNode;
}
```

**4단계: JSX에서 CSS 변수 설정 (`CreateJsxTree`)**

```jsx
// ColorGuide 컴포넌트 내부
<div
  css={Rectangle1Css}
  style={{ "--rectangle1-bg": rectangle1Bg }}  // CSS 변수로 오버라이드
/>
<span css={AACss}>
  {aaText ?? "100"}  // 기본값과 함께 오버라이드
</span>

// Tokens 컴포넌트에서 사용
<ColorGuide rectangle1Bg="#D6D6D6" aaText="90" />
<ColorGuide rectangle1Bg="#B2B2B2" aaText="80" />
```

#### 결과

```css
/* ColorGuide CSS */
const Rectangle1Css = css`
  background: var(--rectangle1-bg, var(--Neutral-100, #FFF));
`;
```

```jsx
// 정확한 인스턴스별 오버라이드 적용
<ColorGuide rectangle1Bg="#FFFFFF" aaText="100" />
<ColorGuide rectangle1Bg="#D6D6D6" aaText="90" />
<ColorGuide rectangle1Bg="#B2B2B2" aaText="80" />
```

#### 테스트

`test/compiler/instanceOverrideProps.test.ts`

---

### 8. 외부 컴포넌트 wrapper에 CSS 클래스 적용

#### 문제

외부 컴포넌트(INSTANCE)를 감싸는 wrapper div에 인라인 스타일이 사용되어 코드가 지저분함.

```jsx
// 인라인 스타일 (지저분)
<div style={{ height: "88px", flex: "1 0 104.72px", width: "104.72px" }}>
  <ColorGuide ... />
</div>
```

#### 원인

- `CreateJsxTree._wrapWithLayoutDiv`에서 항상 인라인 스타일 사용
- 이미 생성된 CSS 클래스(`ColorguideCss`)가 활용되지 않음

#### 해결

`CreateJsxTree._wrapWithLayoutDiv`에서 CSS 클래스 우선 사용:

```typescript
private _wrapWithLayoutDiv(node, componentElement, layoutStyles) {
  const cssVarName = node.generatedNames?.cssVarName;

  if (cssVarName) {
    // CSS 클래스가 있으면 css prop 사용
    const cssAttr = factory.createJsxAttribute("css", cssVarName);
    return wrapWithDiv(cssAttr, componentElement);
  } else {
    // 없으면 인라인 스타일 fallback
    const styleAttr = factory.createJsxAttribute("style", layoutStyles);
    return wrapWithDiv(styleAttr, componentElement);
  }
}
```

#### 결과

```jsx
// CSS 클래스 사용 (깔끔)
<div css={ColorguideCss}>
  <ColorGuide rectangle1Bg="#D6D6D6" aaText="90" />
</div>
```

```css
const ColorguideCss = css`
  display: flex;
  height: 88px;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1 0 104.72px;
`;
```

#### 테스트

`test/compiler/instanceOverrideProps.test.ts`, `test/compiler/layoutRegression.test.ts`

---

### 9. 의존 컴포넌트 children이 비어있을 때 I... 노드 삭제 문제

#### 문제

`Gnb.json`의 의존 컴포넌트들(`Colorgnbhomen` 등)이 아이콘을 렌더링하지 않고 비어있음.

```jsx
// 예상
function Colorgnbhomen(props) {
  return (
    <div>
      <div css={RatioVerticalCss}>...</div>
      <div css={ColorBlankCss}>
        <svg>...</svg> {/* 아이콘 */}
      </div>
    </div>
  );
}

// 실제 (문제)
function Colorgnbhomen(props) {
  return (
    <div>
      {children} {/* 비어있음 */}
    </div>
  );
}
```

#### 원인

1. dependencies의 `info.document.children`이 비어있는 경우, `enrichVariantWithInstanceChildren`로 INSTANCE children을 채움
2. 채워진 children의 ID가 `I...` 형태 (3+ segments: `I18:471;11099:10330;9954:6518`)
3. `updateCleanupNodes`가 모든 `I...` 노드를 삭제함

```typescript
// 문제 코드
if (isInstanceChild && !isRootInstance) {
  nodesToRemove.push(node); // 무조건 삭제
}
```

#### 해결

원래 children이 비어있었고 enrichment로 채워진 경우에만 I... 노드를 유지:

**1단계: 플래그 설정 (`DependencyManager.ts`)**

```typescript
} else {
  const originalChildrenEmpty =
    !enrichedVariant.info.document.children ||
    enrichedVariant.info.document.children.length === 0;

  enrichedVariant = this.instanceOverrideManager.enrichVariantWithInstanceChildren(
    enrichedVariant,
    instanceNode
  );

  // 원래 children이 비어있었고, enrichment로 채워진 경우 플래그 설정
  if (originalChildrenEmpty) {
    (enrichedVariant as any)._enrichedFromEmptyChildren = true;
  }
}
```

**2단계: 플래그 확인 (`_FinalAstTree.updateCleanupNodes`)**

```typescript
const specData = this.specDataManager.getSpec();
const enrichedFromEmptyChildren =
  (specData as any)._enrichedFromEmptyChildren === true;

// I... 노드 삭제 조건 수정
if (isInstanceChild && !isRootInstance && !enrichedFromEmptyChildren) {
  nodesToRemove.push(node);
}
```

#### 결과

| 케이스          | 원래 children | 결과              |
| --------------- | ------------- | ----------------- |
| `error-02.json` | 2개 (있음)    | I... 노드 삭제 ✅ |
| `Gnb.json`      | 0개 (없음)    | I... 노드 유지 ✅ |

```jsx
// 수정 후 정상 렌더링
function Colorgnbhomen(props) {
  return (
    <div css={ColorgnbhomenCss}>
      <div css={RatioVerticalCss}>
        <Ratiovertical ratio="1:1" />
      </div>
      <div css={ColorBlankCss}>
        <div css={HomeCss}>
          <svg css={Rectangle432Css} />
          <svg css={Rectangle435Css} />
          <svg css={Rectangle437Css} />
        </div>
      </div>
    </div>
  );
}
```

#### 테스트

`test/compiler/dependencyEmptyChildren.test.ts`

---

### 10. 의존 컴포넌트에 vectorSvgs 전달

#### 문제

`Gnb.json`의 아이콘들이 SVG로 렌더링되지 않고 빈 `<div>`로 렌더링됨.

#### 원인

1. 메인 문서에 `vectorSvgs` 정보가 있음 (각 VECTOR 노드별 SVG 데이터)
2. dependency 컴파일 시 이 정보가 전달되지 않음
3. dependency의 VECTOR 노드에 `vectorSvg`가 없어서 `<div>`로 렌더링됨

```typescript
// dependency 컴파일 시 vectorSvgs가 전달되지 않음
const enrichedVariant = this.variantEnrichManager.enrichWithVectorSvg(...);
// enrichWithVectorSvg는 루트 노드에만 merged SVG를 추가
```

#### 해결

dependency 컴파일 시 메인 문서의 `vectorSvgs`를 그대로 전달:

```typescript
// DependencyManager.ts
// 메인 문서의 vectorSvgs를 dependency에 전달
const rootVectorSvgs = this.specDataManager.getSpec().vectorSvgs;
if (rootVectorSvgs && Object.keys(rootVectorSvgs).length > 0) {
  enrichedVariant = {
    ...enrichedVariant,
    vectorSvgs: {
      ...(enrichedVariant.vectorSvgs || {}),
      ...rootVectorSvgs,
    },
  };
}
```

추가로, VECTOR/ELLIPSE 노드의 `fill`/`background` 처리:

```typescript
// _TempAstTree.updateVectorStyles
// 1. styleTree의 노드는 type이 없을 수 있으므로 nodeSpec에서도 확인
const nodeType = node.type || nodeSpec?.type;
if (!vectorTypes.includes(nodeType)) return;

// 2. fill 처리
if ("fill" in base) {
  if (hasVectorSvg) {
    base["color"] = base["fill"]; // SVG 내부 fill="currentColor"가 이 색상 사용
  } else {
    base["background"] = base["fill"]; // SVG 없으면 div의 배경색으로
  }
  delete base["fill"];
}

// 3. background 처리 (ELLIPSE 등은 fill 대신 background로 스타일 제공)
if (hasVectorSvg && "background" in base && !("color" in base)) {
  base["color"] = base["background"];
  delete base["background"];
}
```

그리고 태그 결정 시 `vectorSvg` 유무에 따라 `svg` 또는 `div` 선택:

```typescript
// CreateJsxTree._getTagName
case "vector":
  return node.metaData?.vectorSvg ? "svg" : "div";
```

#### 결과

- VECTOR 노드에 `vectorSvg`가 있으면 → `<svg>` 태그로 렌더링
- VECTOR 노드에 `vectorSvg`가 없으면 → `<div>` 태그 + `background` 스타일

#### 테스트

`test/compiler/dependencyEmptyChildren.test.ts`

---

### 11. Gnb.json SVG 아이콘 렌더링 이슈

#### 문제 현상

`Gnb.json`의 My Info 아이콘이 원본(회색 스마일 얼굴)과 다르게 렌더링됨. 원 테두리만 보이고 내부 fill 색상이 적용되지 않음.

#### 원인 분석

**1단계: fill → color 변환 누락**

SVG 내부의 `fill="currentColor"`는 부모의 CSS `color` 속성을 상속받아야 함. 하지만 `updateVectorStyles`에서 `fill`을 `color`로 변환하지 않아 색상이 미적용됨.

**2단계: styleTree 노드 타입 없음**

`styleTree`의 노드는 `type`이 `undefined`일 수 있음. `vectorTypes.includes(node.type)` 조건이 `false`가 되어 처리 스킵됨.

**해결**: `nodeSpec`에서 원본 타입 조회

```typescript
const nodeType = node.type || nodeSpec?.type;
if (!vectorTypes.includes(nodeType)) return;
```

**3단계: ELLIPSE의 background 처리**

ELLIPSE 노드(원형)는 `fill` 대신 `background`로 스타일 제공됨. `vectorSvg`가 있으면 `background`도 `color`로 변환 필요.

```typescript
if (hasVectorSvg && "background" in base && !("color" in base)) {
  base["color"] = base["background"];
  delete base["background"];
}
```

#### 해결

**핵심 로직 (`_TempAstTree.updateVectorStyles`)**

| 조건                            | 변환                   | 이유                           |
| ------------------------------- | ---------------------- | ------------------------------ |
| `fill` + `vectorSvg` 있음       | `fill` → `color`       | SVG path가 `currentColor` 사용 |
| `fill` + `vectorSvg` 없음       | `fill` → `background`  | div로 렌더링, 배경색 적용      |
| `background` + `vectorSvg` 있음 | `background` → `color` | ELLIPSE 등 특수 케이스         |

**구현 코드**:

```typescript
// _TempAstTree.updateVectorStyles

// 1. 노드 타입 확인 (styleTree의 type이 없을 수 있음)
const nodeType = node.type || nodeSpec?.type;
if (!vectorTypes.includes(nodeType)) return;

// 2. fill 처리
if ("fill" in base) {
  if (hasVectorSvg) {
    base["color"] = base["fill"]; // SVG 내부 fill="currentColor"가 이 색상 사용
  } else {
    base["background"] = base["fill"]; // SVG 없으면 div의 배경색으로
  }
  delete base["fill"];
}

// 3. background 처리 (ELLIPSE 등은 fill 대신 background로 스타일 제공)
if (hasVectorSvg && "background" in base && !("color" in base)) {
  base["color"] = base["background"];
  delete base["background"];
}
```

#### 결과

- SVG 아이콘의 `fill="currentColor"`가 부모의 `color` CSS 속성을 정상적으로 상속
- ELLIPSE 노드도 `background` → `color` 변환으로 정상 렌더링
- My Info 아이콘이 원본과 동일하게 회색 스마일 얼굴로 표시됨

#### 테스트

`test/fixtures/failing/Gnb.json`

---

### 12. Popup 컴포넌트 내부 버튼 렌더링 안됨

#### 문제

복잡한 중첩 구조의 Popup 컴포넌트에서 하위 dependency 컴포넌트(Popupbottom) 내부의 버튼(Large)이 렌더링되지 않음.

```
Figma 원본:
┌─────────────────────────────┐
│ Location services turned off│
│ Turn on location services...│
│ [이미지]                     │
│ ┌─────────────────────────┐ │
│ │      Confirm (파란버튼)   │ │  ← 렌더링 안됨
│ └─────────────────────────┘ │
└─────────────────────────────┘

잘못된 렌더링:
- Popupbottom 컴포넌트가 {children}만 렌더링
- Large 버튼 컴포넌트가 누락됨
```

#### 원인

4가지 문제가 복합적으로 발생:

**1. 중첩 dependency INSTANCE 검색 실패**

`InstanceOverrideManager.findInstanceNodeForComponentId()`가 메인 document만 검색하여 dependency document 내부의 INSTANCE를 찾지 못함.

```
구조:
Popup (메인)
└── Popupbottom INSTANCE (247:1097)
    └── Right Button INSTANCE (I247:1097;243:125) → componentId: 14:1657

findInstanceNodeForComponentId(14:1657)
→ 메인 document에서만 검색
→ dependency document (Popupbottom)에서 14:1657 참조하는 INSTANCE 못 찾음
```

**2. visible:false INSTANCE가 ArraySlot으로 감지됨**

Left Button(`visible: false`)과 Right Button이 같은 ComponentSet을 참조하여 2개 이상으로 인식, ArraySlot으로 잘못 감지됨.

```typescript
// ArraySlotDetector가 visible:false 노드를 포함하여 카운트
instances = [LeftButton, RightButton]; // 2개 → ArraySlot으로 감지
```

**3. I... 노드가 삭제됨**

`updateCleanupNodes`에서 I... ID를 가진 노드가 삭제되는데, dependency가 있는 INSTANCE 노드도 함께 삭제됨.

```typescript
// 기존 로직: I... 노드는 무조건 삭제 (enrichedFromEmptyChildren 플래그 없으면)
if (isInstanceChild && !isRootInstance && !enrichedFromEmptyChildren) {
  nodesToRemove.push(node);
}
```

**4. _enrichedFromEmptyChildren 플래그 미설정**

`enrichVariantWithInstanceChildren()` 호출 시 원래 children이 비어있을 때만 플래그 설정. 하지만 children이 있어도 I... ID로 교체되면 플래그가 필요함.

```typescript
// 기존: 원래 children이 비어있을 때만 플래그 설정
if (originalChildrenEmpty) {
  enrichedVariant._enrichedFromEmptyChildren = true;
}
```

#### 해결

**1. InstanceOverrideManager - dependency document 검색 추가**

```typescript
public findInstanceNodeForComponentId(componentId: string): any | null {
  // 1. 메인 document에서 먼저 검색
  const foundInMain = traverse(document);
  if (foundInMain) return foundInMain;

  // 2. 메인에서 못 찾으면 dependency documents에서 검색
  const dependencies = this.specDataManager.getDependencies();
  if (dependencies) {
    for (const depData of Object.values(dependencies)) {
      const depDocument = (depData as any)?.info?.document;
      if (depDocument) {
        const foundInDep = traverse(depDocument);
        if (foundInDep) return foundInDep;
      }
    }
  }
  return null;
}
```

**2. ArraySlotDetector - visible:false INSTANCE 제외**

```typescript
// INSTANCE 타입이면서 visible: false가 아닌 children만 필터링
const instances = children.filter(
  (child: any) => child.type === "INSTANCE" && child.visible !== false
);
```

**3. _FinalAstTree - dependency INSTANCE 노드 보존**

```typescript
if (isInstanceChild && !isRootInstance && !enrichedFromEmptyChildren) {
  // INSTANCE 타입이고 dependency에 있는 componentId를 참조하면 유지
  const nodeSpec = this.specDataManager.getSpecById(node.id);
  const componentId = (nodeSpec as any)?.componentId;
  const dependencies = this.specDataManager.getDependencies();
  const hasDependency = componentId && dependencies && dependencies[componentId];

  if (!hasDependency) {
    nodesToRemove.push(node);
  }
}
```

**4. DependencyManager - 플래그 항상 설정**

```typescript
} else {
  // 오버라이드가 없으면 INSTANCE children을 그대로 사용
  enrichedVariant = this.instanceOverrideManager.enrichVariantWithInstanceChildren(
    enrichedVariant,
    instanceNode
  );

  // INSTANCE children (I... ID)을 사용하므로 플래그 설정
  // 이 플래그가 있으면 updateCleanupNodes에서 I... 노드가 삭제되지 않음
  (enrichedVariant as any)._enrichedFromEmptyChildren = true;
}
```

#### 테스트

`test/compiler/popupNestedDependency.test.ts`

---

### 13. ArraySlot componentId 기반 그룹핑

#### 문제

같은 ComponentSet의 다른 Variant들(예: Left Button(Neutral), Right Button(Primary))이 같은 ArraySlot으로 잘못 그룹핑됨.

```
예:
- Left Button: componentId=14:1665, componentSetId=14:1636
- Right Button: componentId=14:1657, componentSetId=14:1636

기존 로직: componentSetId가 같으므로 → 같은 ArraySlot으로 묶임 (잘못됨)
```

#### 원인

`ArraySlotDetector.groupInstancesByComponent()`가 `componentSetId`로 그룹핑하여, 같은 ComponentSet의 서로 다른 Variant들이 하나의 ArraySlot으로 잘못 감지됨.

#### 해결

`componentId`로만 그룹핑하여 정확히 같은 Variant만 ArraySlot으로 감지:

```typescript
private groupInstancesByComponent(instances: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const instance of instances) {
    // componentId로 그룹핑 (정확히 같은 Variant만)
    const componentId = instance.componentId;
    const key = `componentId:${componentId}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(instance);
  }
  return groups;
}
```

#### 결과

| 케이스 | 기존 (componentSetId) | 수정 (componentId) |
| ------ | -------------------- | ------------------ |
| Option 1, 2, 3 | 3개 모두 같은 ArraySlot | Option 2, 3만 ArraySlot (같은 componentId) |
| Left, Right Button | 같은 ArraySlot (잘못됨) | 별도 처리 (다른 componentId) |

#### 테스트

`test/compiler/arraySlot.test.ts` - "componentId 기반 그룹핑"

---

### 14. SuperTree 병합 후 ArraySlot parentId 불일치

#### 문제

ArraySlot의 `parentId`가 원본 Figma variant 노드 ID인데, AST는 병합된 SuperTree에서 생성되어 ID가 불일치. `.map()` 렌더링이 생성되지 않음.

```
예:
- ArraySlot parentId: 133:791 (variant "Size=default, Options=3 options")
- AST root ID: 133:737 (대표 variant "Size=default, Options=2 options")

CreateJsxTree에서 arraySlotByParentId.get(133:737)
→ undefined (133:791만 등록됨)
→ .map() 렌더링 생성 안됨
```

#### 원인

1. `ArraySlotDetector`가 원본 Figma variant 노드 ID를 `parentId`로 저장
2. `CreateSuperTree`가 여러 variant를 하나의 AST로 병합, 대표 variant의 ID 사용
3. `CreateJsxTree._createChildren()`에서 `parentId` 매칭 실패

#### 해결

`CreateJsxTree._findArraySlotForNode()`에서 children ID로 매칭:

```typescript
private _findArraySlotForNode(node: FinalAstTree): ArraySlot | undefined {
  // 1. parentId로 직접 매칭 (기존 로직)
  const directMatch = this.arraySlotByParentId.get(node.id);
  if (directMatch) {
    return directMatch;
  }

  // 2. children의 ID로 매칭
  for (const slot of this.arraySlots) {
    const instanceIds = new Set(slot.instances.map((i) => i.id));

    for (const child of node.children) {
      if (instanceIds.has(child.id)) {
        return slot;
      }

      // externalComponent의 componentId로도 확인
      if (child.externalComponent) {
        const extCompId = child.externalComponent.componentId;
        if (slot.componentId && extCompId === slot.componentId) {
          return slot;
        }
      }
    }
  }

  return undefined;
}
```

#### 결과

```jsx
// 이전: 조건부 렌더링 (각 variant별)
{size === "default" && options === "3 options" && (
  <>
    <SelectButton selected="true" labelText="Option 2" />
    <SelectButton selected="true" labelText="Option 3" />
  </>
)}

// 이후: .map() 렌더링
{options.map((item, index) => (
  <div key={index} style={{ height: "24px", flex: "1 0 88px" }}>
    <SelectButton size={item.size} selected={item.selected} text={item.text} />
  </div>
))}
```

#### 테스트

`test/compiler/arraySlot.test.ts` - "SuperTree 병합 ID 매칭"

---

### 11. BOOLEAN_OPERATION 노드 SVG 렌더링 누락

#### 문제

Status Bar 같은 복잡한 UI 컴포넌트에서 배터리 아이콘, 신호 강도 아이콘 등이 렌더링되지 않음.

```
Figma 원본:
┌─────────────────────────────────────┐
│ 12:22  📶  📶  🔋                   │
└─────────────────────────────────────┘

잘못된 렌더링:
┌─────────────────────────────────────┐
│ 12:22  [ ]  [ ]  [ ]                │  ← 아이콘들이 빈 박스로 표시
└─────────────────────────────────────┘
```

#### 원인

Figma의 복잡한 도형들은 `BOOLEAN_OPERATION` 노드로 표현됨:

```
GROUP (Status Bar – Battery)
└── BOOLEAN_OPERATION (booleanOperation: "UNION")
    ├── BOOLEAN_OPERATION (booleanOperation: "EXCLUDE")
    │   ├── VECTOR (Outer)
    │   └── VECTOR (Inner)
    └── VECTOR (Path)
```

- `BOOLEAN_OPERATION`: 여러 VECTOR를 조합한 복합 도형
  - `UNION`: 합집합
  - `SUBTRACT`: 차집합
  - `INTERSECT`: 교집합
  - `EXCLUDE`: 배타적 OR (XOR)

SVG 수집 및 처리 로직에서 `BOOLEAN_OPERATION` 타입이 누락되어 있었음:

```typescript
// FigmaPlugin.ts - BOOLEAN_OPERATION 누락
if (
  node.type === "VECTOR" ||
  node.type === "LINE" ||
  node.type === "STAR" ||
  node.type === "ELLIPSE" ||
  node.type === "POLYGON"
  // BOOLEAN_OPERATION 없음!
) {
  const svgBytes = await node.exportAsync({ format: "SVG" });
  vectorSvgs[node.id] = svgString;
}
```

#### 해결

**1. 백엔드 (FigmaPlugin.ts)**: BOOLEAN_OPERATION SVG 수집 추가

```typescript
// _traverseAndCollectVectors
if (
  node.type === "VECTOR" ||
  node.type === "LINE" ||
  node.type === "STAR" ||
  node.type === "ELLIPSE" ||
  node.type === "POLYGON" ||
  node.type === "BOOLEAN_OPERATION"  // 추가
) {
  const svgBytes = await node.exportAsync({ format: "SVG" });
  vectorSvgs[node.id] = String.fromCharCode(...svgBytes);
}
```

**2. 컴파일러 (_TempAstTree.ts)**: VECTOR 스타일 처리에 BOOLEAN_OPERATION 추가

```typescript
// updateVectorStyles
const vectorTypes = [
  "VECTOR", "LINE", "STAR", "ELLIPSE", "POLYGON",
  "BOOLEAN_OPERATION"  // 추가
];
```

**3. 컴파일러 (_FinalAstTree.ts)**: semanticRole 및 vectorSvg 메타데이터 처리

```typescript
// updateMetaData switch case
case "VECTOR":
case "LINE":
case "STAR":
case "ELLIPSE":
case "POLYGON":
case "BOOLEAN_OPERATION": {  // 추가
  node.semanticRole = "vector";
  const vectorSvg = this.specDataManager.getVectorSvgByNodeId(node.id);
  if (vectorSvg) {
    node.metaData.vectorSvg = vectorSvg;
  }
  break;
}
```

#### 결과

```jsx
// 이전: 빈 div (SVG 없음)
<div css={BodyCss} />

// 이후: 실제 SVG 렌더링
<svg css={BodyCss} width={24} height={12} viewBox="0 0 24 12" fill="none">
  <path
    fillRule="evenodd"
    clipRule="evenodd"
    d="M19.4481 0H2.49335C1.11631 0 0 1.11929 0 2.5V9..."
    fill="black"
    fillOpacity={0.38}
  />
</svg>
```

#### 테스트

`test/compiler/booleanOperation.test.ts`

---

### 15. Dependency 루트의 시각적 스타일이 Wrapper와 충돌

#### 문제

Popup 컴포넌트에서 Left Button(Neutral)과 Right Button(Primary)이 서로 다른 배경색을 가져야 하는데, 모두 같은 색(#595B5E)으로 렌더링됨.

```
Figma 원본:
┌─────────────────────────────────────┐
│  [Left Button]    [Right Button]   │
│    (회색)            (파란색)        │
│   #595B5E          #0050FF         │
└─────────────────────────────────────┘

잘못된 렌더링:
┌─────────────────────────────────────┐
│  [Left Button]    [Right Button]   │
│    (회색)            (회색)          │
│   #595B5E          #595B5E         │  ← 둘 다 같은 색!
└─────────────────────────────────────┘
```

#### 원인

1. **Figma API 동작**: INSTANCE 노드에 variant의 root fills를 복사
   - Left Button INSTANCE → Neutral variant 배경색 (#595B5E)
   - Right Button INSTANCE → Primary variant 배경색 (#0050FF)

2. **스타일 중복**: wrapper(INSTANCE)와 dependency 모두 시각적 스타일을 가짐
   - wrapper에는 올바른 variant별 배경색 존재
   - dependency는 대표 variant(Neutral) 하나로만 컴파일됨
   - dependency의 `width: 100%; height: 100%`가 wrapper를 완전히 덮음

3. **결과**: dependency의 배경색이 wrapper의 배경색을 가림

```typescript
// wrapper CSS (올바른 색상)
const RightButtonCss = css`
  background: #0050FF;  // Primary 색상
`;

// dependency CSS (잘못된 색상 - 대표 variant만 사용)
const LargeCss = css`
  background: #595B5E;  // Neutral 색상 (모든 인스턴스에 적용)
  width: 100%;
  height: 100%;         // wrapper를 완전히 덮음
`;
```

#### 해결

**역할 분리 원칙**:
- **wrapper (INSTANCE)**: 시각적 스타일 담당 (background, border-radius, border, opacity)
- **dependency**: 레이아웃 스타일만 담당 (display, flex, gap, align-items 등)

**`VariantEnrichManager.makeRootFlexible()` 확장**:

```typescript
public makeRootFlexible(variant: FigmaNodeData): FigmaNodeData {
  const {
    // 크기 관련 (기존)
    width: _width,
    height: _height,
    // 패딩 관련 (기존)
    padding: _padding,
    "padding-top": _paddingTop,
    "padding-right": _paddingRight,
    "padding-bottom": _paddingBottom,
    "padding-left": _paddingLeft,
    // 시각적 스타일 (추가) - wrapper가 담당
    background: _background,
    "border-radius": _borderRadius,
    border: _border,
    opacity: _opacity,
    ...restCssStyle
  } = variant.styleTree.cssStyle;

  return {
    ...variant,
    styleTree: {
      ...variant.styleTree,
      cssStyle: {
        ...restCssStyle,
        width: "100%",
        height: "100%",
      },
    },
  };
}
```

#### 제거되는 시각적 스타일

| 스타일 | 루트 사용 횟수 | 설명 |
| ------ | ------------- | ---- |
| `background` | 42 | 배경색 - wrapper가 variant별로 담당 |
| `border-radius` | 44 | 모서리 둥글기 - wrapper가 담당 |
| `border` | 6 | 테두리 - wrapper가 담당 |
| `opacity` | 6 | 투명도 - wrapper가 담당 |

#### 결과

```css
/* wrapper CSS - 시각적 스타일 포함 */
const LeftButtonCss = css`
  background: #595B5E;
  border-radius: 8px;
  /* + 레이아웃 스타일 */
`;

const RightButtonCss = css`
  background: #0050FF;      /* 올바른 Primary 색상! */
  border-radius: 8px;
  /* + 레이아웃 스타일 */
`;

/* dependency CSS - 레이아웃만 */
const LargeCss = css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  /* background, border-radius 제거됨 */
`;
```

#### 테스트

`test/compiler/popupVisualStyles.test.ts`

---

### 16. COMPONENT_SET variant별 노드 위치 오프셋 문제

#### 문제

COMPONENT_SET에서 일부 variant에만 존재하는 노드가 잘못된 `top` 값을 가짐. 예를 들어 X3 variant의 `Group21233`이 `top: 144px`로 렌더링됨 (올바른 값은 `top: 0px`).

```
Figma 캔버스:
┌─────────────────────────────────────────┐
│ [X1 variant] (y: 0)                     │
│ [X2 variant] (y: 72)                    │
│ [X3 variant] (y: 144)  ← Group21233 포함 │
└─────────────────────────────────────────┘

잘못된 렌더링:
Group21233 { top: 144px }  ← 캔버스 절대 좌표 사용

올바른 렌더링:
Group21233 { top: 0px }    ← variant 내 상대 좌표
```

#### 원인

- `updatePositionStyles()`에서 부모의 `absoluteBoundingBox`를 기준으로 자식 위치 계산
- COMPONENT_SET의 경우, 각 variant가 캔버스에서 다른 y 좌표에 배치됨
- variant-specific 노드(모든 variant에 존재하지 않는 노드)는 해당 variant의 오프셋이 반영되어 잘못된 위치 계산

#### 해결

`_TempAstTree.updatePositionStyles()`에서 COMPONENT_SET 루트 처리:

```typescript
// COMPONENT_SET의 루트 자식 노드는 variant별로 다른 위치에 있으므로
// variant-specific 노드(모든 variant에 존재하지 않는 노드)는 0,0 기준
if (parentNode === tempAstTree) {
  const actualRootType = this._specDataManager.getRootNodeType();
  if (actualRootType === "COMPONENT_SET") {
    const allVariants = this._specDataManager.getRenderTree().children;
    const totalVariantCount = allVariants?.length || 0;

    // mergedNode 길이가 전체 variant 수보다 작으면 variant-specific 노드
    if (node.mergedNode && node.mergedNode.length < totalVariantCount) {
      left = 0;
      top = 0;
    }
  }
}
```

#### 테스트

`test/compiler/componentSetVariantPosition.test.ts`

---

### 17. SVG fill 색상이 currentColor로 변환되어 다중 색상 손실

#### 문제

Figma에서 여러 색상을 가진 SVG (예: 파란 배경 + 흰색 텍스트)가 모두 같은 색으로 렌더링됨. 특히 배지 색상이 연하게 보이는 문제.

```
Figma 원본:
┌──────────────┐
│ 🔵 #0050FF   │  ← 파란 배경
│   ⬜ white   │  ← 흰색 텍스트/아이콘
│   ⬛ black   │  ← 검정 텍스트
└──────────────┘

잘못된 렌더링:
모든 path의 fill이 "currentColor"로 변환되어
CSS color 속성 하나로 모든 색상이 제어됨
```

#### 원인

`SvgToJsx._createJsxAttributes()`에서 모든 색상 fill 값을 `currentColor`로 변환:

```typescript
// 문제 코드
if (attrName === "fill" && this._isColorValue(attrValue)) {
  finalValue = "currentColor";  // #0050FF, white, black 모두 currentColor로
}
```

이 로직은 단일 색상 아이콘에서 CSS로 색상을 제어하기 위한 것이었으나, 다중 색상 SVG에서는 모든 색상 정보를 잃게 됨.

#### 해결

`SvgToJsx._createJsxAttributes()`에서 원본 fill 색상 유지:

```typescript
// 수정: fill 색상을 그대로 유지 (다중 색상 SVG 지원)
const finalValue = attrValue;
// currentColor 변환 로직 제거
```

`_TempAstTree.updateVectorStyles()`에서 SVG 노드의 불필요한 CSS fill/color 제거:

```typescript
if (isSvgRendered) {
  // SVG path에 직접 색상이 있으므로 CSS fill/background 제거
  delete base["fill"];
  delete base["background"];
}
```

#### 결과

```jsx
// SVG path들이 원본 색상 유지
<svg viewBox="0 0 94 56" fill="none">
  <path d="M80.25..." fill="#0050FF" />  {/* 파란 배경 */}
  <path d="M232..." fill="white" />      {/* 흰색 텍스트 */}
  <path d="M119..." fill="black" />      {/* 검정 텍스트 */}
</svg>
```

#### 테스트

`test/compiler/svgToJsx.test.ts` - "fill 색상 보존" 섹션
`test/compiler/componentSetVariantPosition.test.ts`

---

### 18. TestPage에서 HTML 속성과 충돌하는 Prop 이름 처리

#### 문제

Figma variant prop 이름이 HTML 속성과 충돌하여 컴포넌트가 올바르게 렌더링되지 않음. 예: `name` prop이 HTML `name` 속성으로 인식됨.

```
Figma Variant:
- name: "ONiON X1" | "ONiON X2" | "ONiON X3"

컴파일된 Props:
{ customName: "ONiON X1" }  ← 컴파일러가 name을 customName으로 변환

TestPage에서 전달:
{ name: "ONiON X1" }        ← 변환 안 됨 → props 불일치
```

#### 원인

- 컴파일러(`PropsManager`)는 HTML 속성과 충돌하는 prop 이름을 `customXxx` 형태로 변환
- TestPage의 `parseVariantProps()`는 이 변환을 수행하지 않음
- 결과적으로 컴포넌트에 전달되는 props와 기대하는 props가 불일치

#### 해결

`TestPage.tsx`에 동일한 prop 이름 변환 로직 추가:

```typescript
const CONFLICTING_HTML_ATTRS = [
  "disabled", "type", "value", "name", "id", "hidden",
  "checked", "selected", "required", "readOnly",
  "placeholder", "autoFocus", "autoComplete",
];

function renameConflictingPropName(propName: string): string {
  const lowerPropName = propName.toLowerCase();
  if (CONFLICTING_HTML_ATTRS.some((attr) => attr.toLowerCase() === lowerPropName)) {
    return `custom${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
  }
  return propName;
}

// parseVariantProps에서 사용
camelKey = renameConflictingPropName(camelKey);
```

#### 결과

```typescript
// TestPage에서 올바른 props 전달
parseVariantProps("name=ONiON X1")
// → { customName: "ONiON X1" }  ← 컴파일러와 일치

// 컴포넌트 정상 렌더링
<ColorbrandLogo customName="ONiON X1" />
<ColorbrandLogo customName="ONiON X2" />
<ColorbrandLogo customName="ONiON X3" />
```

---

## 테스트

### 테스트 구조

```
test/
├── compiler/
│   ├── allFixtures.test.ts      # 전체 fixture 통합 테스트
│   ├── compiler.test.ts         # 개별 기능 테스트
│   ├── arraySlot.test.ts
│   ├── iconInstance.test.ts
│   └── ...
├── fixtures/
│   ├── any/                     # 일반 테스트 데이터
│   ├── button/                  # 버튼 컴포넌트
│   └── ...
└── utils/
    └── test-helpers.ts
```

### 테스트 현황

- **테스트 케이스**: 506 passed
- **Fixture 수**: 35개
- **스냅샷 테스트**: Visual Regression 포함

### 주요 테스트 파일

| 테스트 파일 | 설명 |
| ----------- | ---- |
| `arraySlot.test.ts` | ArraySlot 감지, componentId 그룹핑, SuperTree 병합 ID 매칭 |
| `popupNestedDependency.test.ts` | 중첩 dependency 컴포넌트 렌더링 |
| `popupVisualStyles.test.ts` | dependency 시각적 스타일 제거 검증 |
| `dependencyEmptyChildren.test.ts` | dependency children 비어있을 때 I... 노드 처리 |
| `instanceOverrideProps.test.ts` | INSTANCE 오버라이드 props 전달 |
| `layoutRegression.test.ts` | 레이아웃 회귀 테스트 |
| `componentSetVariantPosition.test.ts` | COMPONENT_SET variant 위치 및 SVG 색상 테스트 |

---

### 19. Disabled 상태에서 Color별 텍스트 색상 처리

#### 문제

Disabled 버튼의 텍스트 색상이 Color variant에 따라 다르게 표시되어야 하는데, 모든 Color에서 동일한 회색(#B2B2B2)으로 렌더링됨.

```
Figma 디자인:
- Primary Disabled: 흰색 텍스트 (#FFF) ← 연한 파란 배경에 흰색 유지
- Light Disabled: 회색 텍스트 (#B2B2B2)
- Neutral Disabled: 회색 텍스트 (#B2B2B2)
- Black Disabled: 회색 텍스트 (#B2B2B2)

잘못된 렌더링:
- 모든 Color의 Disabled: 회색 텍스트 (#B2B2B2) ← Primary도 회색!
```

#### 원인

1. `:disabled` pseudo-class는 `<button>` 요소에만 적용되고, 내부 `<span>` 텍스트에는 적용되지 않음
2. 기존 로직은 Disabled 텍스트 색상을 boolean 조건으로만 처리:
   ```typescript
   ${$customDisabled ? { color: "#B2B2B2" } : {}}
   ```
3. Color prop에 따른 분기 처리가 없어서 모든 Color에 같은 회색 적용

#### 해결

**`indexedConditional` 패턴 적용**:

Boolean prop(Disabled)과 Index prop(Color)을 조합하여 Color별로 다른 Disabled 텍스트 색상 적용.

**1단계: Figma variant에서 Color별 Disabled 텍스트 색상 추출 (`_FinalAstTree.ts`)**

```typescript
// _applyDisabledStylesFromVariants에서 Color별 disabled 텍스트 색상 추출
const disabledTextColors: Record<string, string> = {};

for (const [variantName, textChild] of Object.entries(variantTextChildren)) {
  // "Color=Primary, Disabled=True" 형태에서 Color 값 추출
  const colorMatch = variantName.match(/Color=([^,]+)/i);
  const disabledMatch = variantName.match(/Disabled=True/i);

  if (colorMatch && disabledMatch) {
    const colorValue = colorMatch[1].trim();
    const textColor = textChild?.fills?.[0]?.color;
    if (textColor) {
      disabledTextColors[colorValue] = rgbaToHex(textColor);
    }
  }
}
```

**2단계: TEXT 노드에 indexedConditional 설정**

```typescript
// Primary는 흰색 유지, 나머지는 회색
const ADisabledColorStyles = {
  Primary: {},                    // 변경 없음 - 기본 흰색 유지
  Light: { color: "#B2B2B2" },
  Neutral: { color: "#B2B2B2" },
  Black: { color: "#B2B2B2" },
};

node.style.indexedConditional = {
  booleanProp: "customDisabled",
  indexProp: "color",
  styles: ADisabledColorStyles,
};
```

**3단계: 코드 생성 (`GenerateStyles.ts`)**

```typescript
// indexedConditional을 Emotion CSS 함수로 변환
const ACss = (
  $color: NonNullable<LargeProps["color"]>,
  $customDisabled: NonNullable<LargeProps["customDisabled"]>
) => css`
  text-align: center;
  font-family: Pretendard;
  font-size: 16px;
  font-weight: 700;
${AColorStyles[$color]}
${$customDisabled ? ADisabledColorStyles[$color] : {}}
`;
```

#### 결과

```typescript
// 생성된 코드
const ADisabledColorStyles = {
  Primary: {},                    // 흰색 유지
  Light: { color: "#B2B2B2" },
  Neutral: { color: "#B2B2B2" },
  Black: { color: "#B2B2B2" },
};

// JSX에서 사용
<span css={ACss(color, customDisabled)}>{text}</span>
```

브라우저 확인 결과:
| Color | Disabled 텍스트 색상 | 상태 |
|-------|---------------------|------|
| Primary | `rgb(255, 255, 255)` (흰색) | ✓ |
| Light | `rgb(178, 178, 178)` (회색) | ✓ |
| Neutral | `rgb(178, 178, 178)` (회색) | ✓ |
| Black | `rgb(178, 178, 178)` (회색) | ✓ |

#### 테스트

`test/compiler/disabledTextColor.test.ts`

---

### 20. Dependency에서 visible override가 있는 INSTANCE의 styleTree 병합 누락

#### 문제

Case 컴포넌트의 Pressed 버튼이 Figma 원본과 다르게 렌더링됨:

```
Figma 원본 (Pressed 버튼):
- Decorateinteractive 오버레이 표시됨
- width: 343px
- opacity: 0.24

잘못된 렌더링:
- Decorateinteractive 오버레이가 보이지 않음 (브라우저 기본 흰 배경)
- width: 83px (잘못됨)
- opacity: 0.08 (잘못됨)
```

#### 원인

Case 컴포넌트는 Large dependency를 사용하며, Pressed 상태에서는 숨겨진 Decorateinteractive를 visible=true로 override함.

**1. Dependency 루트 배경색 누락**

`VariantEnrichManager.makeRootFlexible()`이 dependency 루트에서 background를 제거하여 투명도가 있는 Decorateinteractive 아래로 브라우저 기본 배경(흰색)이 노출됨.

```typescript
// 기존 코드
const {
  width: _width,
  height: _height,
  padding: _padding,
  background: _background,  // 제거됨
  ...restCssStyle
} = variant.styleTree.cssStyle;

// 결과: 배경색 없음 → 브라우저 기본 흰색 배경 노출
```

**2. visible override가 있을 때 styleTree 병합 누락**

`InstanceOverrideManager.enrichVariantWithStyleTreeOnly()`에서 `hasHiddenChildren`이 true이면 styleTree 병합을 완전히 건너뛰어, Decorateinteractive의 크기와 opacity override가 적용되지 않음.

```typescript
// 기존 코드
if (instanceOverrides.hasHiddenChildren) {
  return variant;  // styleTree 병합 안함 → 크기/opacity override 누락
}
```

**3. INSTANCE 선택 시 visible override 우선순위 누락**

`DependencyManager`에서 dependency를 컴파일할 때 variant 중 첫 번째 INSTANCE를 무조건 선택하여, visible override가 있는 INSTANCE(Decorateinteractive)의 스타일이 반영되지 않음.

```typescript
// 기존 코드
const someInstanceNode = Object.values(variantInstances)[0];
// Pressed variant의 Decorateinteractive(visible=true)가 아닌
// Default variant의 Decorateinteractive(visible=false)를 선택
```

#### 해결

**1. `VariantEnrichManager.makeRootFlexible()`: transparent 배경 및 relative 위치 추가**

```typescript
public makeRootFlexible(variant: FigmaNodeData): FigmaNodeData {
  const {
    width: _width,
    height: _height,
    padding: _padding,
    "padding-top": _paddingTop,
    "padding-right": _paddingRight,
    "padding-bottom": _paddingBottom,
    "padding-left": _paddingLeft,
    background: _background,
    "border-radius": _borderRadius,
    border: _border,
    opacity: _opacity,
    ...restCssStyle
  } = variant.styleTree.cssStyle;

  // transparent 배경 추가 - 브라우저 기본 배경 방지
  const backgroundStyle = { background: "transparent" };

  // absolute 자식이 있으면 position: relative 추가
  const hasAbsoluteChild = Object.values(variant.children || {}).some(
    (child) => child?.styleTree?.cssStyle?.position === "absolute"
  );
  const positionStyle = hasAbsoluteChild ? { position: "relative" as const } : {};

  return {
    ...variant,
    styleTree: {
      ...variant.styleTree,
      cssStyle: {
        ...restCssStyle,
        ...backgroundStyle,
        ...positionStyle,
        width: "100%",
        height: "100%",
      },
    },
  };
}
```

**2. `InstanceOverrideManager.enrichVariantWithStyleTreeOnly()`: children 유지하면서 styleTree만 병합**

```typescript
public enrichVariantWithStyleTreeOnly(
  variant: FigmaNodeData,
  instanceNode: FigmaNodeData
): FigmaNodeData {
  const instanceOverrides = this.extractOverrides(variant, instanceNode);

  // hasHiddenChildren여도 styleTree는 병합 (크기, opacity 등)
  const mergedVariant = this.variantEnrichManager.mergeInstanceOverrides(
    variant,
    instanceOverrides.styleTree
  );

  // children은 원본 variant의 children 유지 (visible override 반영 안함)
  return {
    ...mergedVariant,
    children: variant.children,  // 원본 children 유지
  };
}
```

**3. `DependencyManager`: visible override가 있는 INSTANCE 우선 선택**

```typescript
private _getRepresentativeInstanceNode(
  variantInstances: Record<string, FigmaNodeData>
): FigmaNodeData {
  const instances = Object.values(variantInstances);

  // 1순위: visible override가 있는 INSTANCE (숨겨진 자식을 보이게 하는 경우)
  const visibleOverrideInstance = instances.find((inst) => {
    const overrides = inst.metaData?.overrides || [];
    return overrides.some((ov) => ov.overriddenFields?.includes("visible"));
  });

  if (visibleOverrideInstance) {
    return visibleOverrideInstance;
  }

  // 2순위: 첫 번째 INSTANCE
  return instances[0];
}
```

#### 결과

```typescript
// Large.tsx (컴파일된 dependency)

// 1. transparent 배경 추가
const LargeCss = css`
  background: transparent;  // 브라우저 기본 배경 방지
  position: relative;       // absolute 자식(Decorateinteractive) 위치 기준
  width: 100%;
  height: 100%;
`;

// 2. visible override가 있는 INSTANCE의 styleTree 병합 (343px, opacity: 0.24)
const DecorateInteractiveCss = ($showInteraction: boolean) => css`
  display: ${$showInteraction ? "flex" : "none"};
  width: 343px;           // override 적용됨
  height: 56px;
  opacity: 0.24;          // override 적용됨
  background: #000;
  position: absolute;
  top: 0;
  left: 0;
`;
```

브라우저 렌더링:
| 항목 | 기존 | 수정 후 | 상태 |
|------|------|---------|------|
| Decorateinteractive 배경 | 흰색 (브라우저 기본) | 검은색 (opacity: 0.24) | ✓ |
| width | 83px | 343px | ✓ |
| opacity | 0.08 | 0.24 | ✓ |
| position | relative | absolute (부모는 relative) | ✓ |

#### 테스트

`test/compiler/caseVisibleOverride.test.ts`

---

### 21. 메인과 의존성 컴포넌트 이름 충돌로 인한 무한 렌더링

#### 문제

메인 컴포넌트와 의존성 컴포넌트의 이름이 대소문자만 다른 경우 (예: "Label" vs "label"), 컴파일 후 무한 렌더링이 발생함.

```
Figma 구조:
- 메인 컴포넌트: "Label" (FRAME)
  └── 의존성: "label" (COMPONENT)

컴파일 결과:
- normalizeComponentName("Label") → "Label"
- normalizeComponentName("label") → "Label"  ← 충돌!

JSX 코드:
function Label() {
  return <div><Label /></div>;  ← 자기 자신을 호출 → 무한 재귀
}
```

#### 원인

1. **컴포넌트 이름 정규화**: `normalizeComponentName()` 함수가 첫 글자를 대문자로 변환
   - "label" → "Label"
   - "Label" → "Label"

2. **이름 충돌 발생**: 메인 컴포넌트와 의존성 컴포넌트가 같은 이름으로 정규화됨

3. **JSX에서 자기 참조**: 의존성 컴포넌트 이름이 메인과 같아져서 JSX에서 자기 자신을 호출
   ```tsx
   function Label() {
     return (
       <div>
         <Label />  // 의존성을 호출하려 했으나 자기 자신을 호출
       </div>
     );
   }
   ```

#### 해결

**DependencyManager.ts에서 이름 충돌 감지 및 해결**:

1. **충돌 감지**: 의존성 컴포넌트 이름이 메인 컴포넌트 이름과 같은지 확인

2. **이름 변경**: 충돌 시 의존성 컴포넌트 이름에 `_` 접두사 추가

3. **원본 이름 저장**: `CompiledDependency` 인터페이스에 `originalName` 필드 추가

4. **JSX 참조 치환**: 메인 컴포넌트 코드에서 원본 이름을 변경된 이름으로 치환

**수정 파일**: `DependencyManager.ts`

```typescript
// 1. CompiledDependency 인터페이스에 originalName 추가
export interface CompiledDependency {
  componentName: string;
  originalName?: string; // 충돌로 이름이 변경된 경우 원래 이름
  code: string;
  componentSetId: string;
}

// 2. compileWithDependencies: 이름 충돌 시 _ 접두사 추가
const originalDepName = normalizeComponentName(group.componentSetName);
let depComponentName = originalDepName;

// 메인 컴포넌트와 이름 충돌 방지
if (depComponentName === componentName) {
  depComponentName = `_${depComponentName}`;
}

compiledDeps[componentSetId] = {
  componentName: depComponentName,
  originalName: originalDepName !== depComponentName ? originalDepName : undefined,
  code: depCode || "",
  componentSetId,
};

// 3. bundleWithDependencies: JSX 참조 치환
let finalMainCode = mainCodeWithoutImports;
for (const dep of Object.values(result.dependencies)) {
  if (dep.originalName) {
    const jsxOpenRegex = new RegExp(
      `<${dep.originalName}(\\s|>|/)`,
      "g"
    );
    const jsxCloseRegex = new RegExp(`</${dep.originalName}>`, "g");
    finalMainCode = finalMainCode
      .replace(jsxOpenRegex, `<${dep.componentName}$1`)
      .replace(jsxCloseRegex, `</${dep.componentName}>`);
  }
}
```

#### 결과

```tsx
// 의존성 컴포넌트: 이름에 _ 접두사 추가
function _Label(props) {
  return (
    <div css={_LabelCss}>
      <span css={TitleCss}>Normal</span>
    </div>
  );
}

// 메인 컴포넌트: JSX에서 _Label 참조
function Label(props) {
  return (
    <div css={LabelCss}>
      <span css={TitleCss}>Interaction</span>
      <div css={Frame960Css}>
        <_Label />  {/* 충돌 해결: 자기 자신이 아닌 의존성 호출 */}
        <_Label />
      </div>
    </div>
  );
}
```

브라우저 렌더링:
- 무한 렌더링 없음 ✓
- 메인 컴포넌트와 의존성 컴포넌트가 올바르게 렌더링됨 ✓

#### 테스트

`test/compiler/componentNameConflict.test.ts`

---

### 22. COMPONENT_SET 내부 TEXT 노드가 slot으로 변환되지 않음

#### 문제

COMPONENT_SET 컴포넌트의 TEXT 노드가 slot으로 변환되지 않아, 텍스트가 하드코딩되어 렌더링됨.

```
Figma 구조:
- Headersub (COMPONENT_SET)
  ├── Variant 1
  │   ├── INSTANCE (아이콘)
  │   ├── TEXT "검색"
  │   └── INSTANCE (아이콘)
  └── Variant 2
      ├── INSTANCE (아이콘)
      ├── TEXT "장바구니"
      └── INSTANCE (아이콘)

기대: INSTANCE들과 TEXT가 모두 slot으로 변환
실제: INSTANCE는 slot이지만, TEXT는 하드코딩됨
```

#### 원인

1. **isComponentSetRoot 조건 불완전**: `_FinalAstTree.ts`의 `isComponentSetRoot` 변수가 astTree의 첫 번째 variant만 확인
   ```typescript
   // 기존 코드 (line 2491)
   const isComponentSetRoot = rootSpec?.type === "COMPONENT_SET";
   // ❌ rootSpec이 variant를 가리키면 false
   ```

2. **TEXT slot 변환 로직 누락**: INSTANCE는 `isExposedInstance` 체크로 slot 변환이 되지만, TEXT 노드는 별도 처리 없음

3. **originalDocument 미활용**: `specDataManager.getDocument()`로 원본 COMPONENT_SET을 가져올 수 있지만 사용하지 않음

#### 해결

**수정 파일**: `_FinalAstTree.ts`

**1. isComponentSetRoot 조건 개선 (line 2491-2493)**

originalDocument까지 확인하여 COMPONENT_SET 여부를 정확히 판별:

```typescript
const rootSpec = this.specDataManager.getSpecById(astTree.id);
const originalDocument = this.specDataManager.getDocument();
const isComponentSetRoot =
  rootSpec?.type === "COMPONENT_SET" ||
  originalDocument?.type === "COMPONENT_SET";  // 추가
```

**2. TEXT 노드 slot 변환 로직 추가 (line 2634-2650)**

COMPONENT_SET 내부의 모든 TEXT 노드를 slot으로 변환:

```typescript
// TEXT 노드를 slot으로 변환 (COMPONENT_SET 내부의 TEXT 노드)
// - isExposedInstance 체크 없이 COMPONENT_SET 내부의 TEXT 노드는 모두 slot으로 처리
if (isComponentSetRoot && node.type === "TEXT") {
  // slot 이름 생성: TEXT 노드의 name을 camelCase로 변환
  let baseSlotName = toCamelCase(node.name) || "text";
  let slotName = baseSlotName;
  let counter = 2;
  while (collectedSlotNames.has(slotName)) {
    slotName = `${baseSlotName}${counter}`;
    counter++;
  }

  (node as any).isSlot = true;
  (node as any).slotName = slotName;
  (node as any).isTextSlot = true; // TEXT slot임을 표시
  collectedSlotNames.add(slotName);

  node.children = [];
  return;
}
```

**핵심 변경사항**:
1. `originalDocument?.type === "COMPONENT_SET"` 조건 추가로 정확한 root 타입 판별
2. TEXT 노드 slot 변환 로직 추가 (camelCase 이름 변환, 중복 방지)
3. `isTextSlot: true` 플래그로 TEXT slot임을 명시적으로 표시

#### 결과

```tsx
// Headersub 컴포넌트
interface HeadersubProps {
  normalResponsive?: React.ReactNode;  // 왼쪽 아이콘 slot
  text?: React.ReactNode;              // 텍스트 slot
  normalResponsive2?: React.ReactNode; // 오른쪽 아이콘 slot
}

function Headersub({ normalResponsive, text, normalResponsive2 }: HeadersubProps) {
  return (
    <div css={HeadersubCss}>
      {normalResponsive || <div css={SlotPlaceholderCss}>normalResponsive</div>}
      {text || <div css={SlotPlaceholderCss}>text</div>}
      {normalResponsive2 || <div css={SlotPlaceholderCss}>normalResponsive2</div>}
    </div>
  );
}
```

브라우저 렌더링 (TestPage):
- 세 개의 slot이 모두 점선 박스로 표시됨 ✓
- `{normalResponsive}` - 왼쪽 아이콘 slot
- `{text}` - 텍스트 slot
- `{normalResponsive2}` - 오른쪽 아이콘 slot

#### 테스트

`test/compiler/componentSetTextSlot.test.ts`

---

### 23. NodeMatcher child pattern 비교 시 prefix 매칭 미지원

#### 문제

Variant 간 자식 노드 개수가 다른 경우, 같은 노드임에도 불구하고 서로 다른 노드로 판단되어 불필요한 slot이 생성됨.

```
Figma 구조:
- Headersub (COMPONENT_SET)
  ├── Default variant
  │   ├── INSTANCE (왼쪽 아이콘)
  │   ├── TEXT "검색"
  │   └── INSTANCE (오른쪽 아이콘)  ← 3개 자식
  └── Basic variant
      ├── INSTANCE (왼쪽 아이콘)
      └── TEXT "검색"                ← 2개 자식

기대: 3개의 slot 생성 (왼쪽 아이콘, 텍스트, 오른쪽 아이콘)
실제: 4개의 slot 생성 (Basic의 노드들이 별도 slot으로 인식됨)
```

**Child pattern 비교**:
- Default variant: `"INSTANCE-TEXT-INSTANCE"` (자식 3개)
- Basic variant: `"INSTANCE-TEXT"` (자식 2개)
- 패턴이 다르므로 같은 구조로 인식되지 않음 → 매칭 실패

#### 원인

`NodeMatcher._compareByStructure()` 메서드에서 child pattern 비교가 너무 엄격함:

```typescript
// 기존 코드 (NodeMatcher.ts line 93-109)
private _compareByStructure(nodeA: FrameNode, nodeB: FrameNode): boolean {
  const patternA = this._getChildPattern(nodeA);
  const patternB = this._getChildPattern(nodeB);

  // 패턴이 완전히 동일한 경우만 true
  if (patternA === patternB) return true;

  // ❌ prefix 관계는 고려하지 않음
  return false;
}
```

**문제 시나리오**:
1. Default variant의 FRAME: `"INSTANCE-TEXT-INSTANCE"` (3개)
2. Basic variant의 FRAME: `"INSTANCE-TEXT"` (2개)
3. `"INSTANCE-TEXT"`가 `"INSTANCE-TEXT-INSTANCE"`의 prefix임에도 불구하고 false 반환
4. 두 FRAME이 다른 노드로 판단됨
5. 각각의 자식들이 별도의 slot으로 생성됨 (4개)

#### 해결

**수정 파일**: `NodeMatcher.ts`

**prefix 매칭 허용 (line 102-106)**:

한 패턴이 다른 패턴의 prefix인 경우 같은 구조로 판단:

```typescript
private _compareByStructure(nodeA: FrameNode, nodeB: FrameNode): boolean {
  const patternA = this._getChildPattern(nodeA);
  const patternB = this._getChildPattern(nodeB);

  // 패턴이 완전히 동일하면 true
  if (patternA === patternB) return true;

  // 한 패턴이 다른 패턴의 prefix인 경우 true (variant간 자식 수가 다른 경우 허용)
  // 예: "INSTANCE-TEXT-INSTANCE" vs "INSTANCE-TEXT" → "INSTANCE-TEXT"가 prefix이므로 true
  if (patternA.startsWith(patternB) || patternB.startsWith(patternA)) {
    return true;
  }

  return false;
}
```

**핵심 변경사항**:
1. `startsWith()` 메서드로 prefix 관계 확인
2. 한쪽 패턴이 다른 쪽의 부분집합이면 같은 구조로 판단
3. Variant간 선택적 자식 노드(optional children)를 올바르게 처리

#### 결과

```tsx
// Headersub 컴포넌트
interface HeadersubProps {
  normalResponsive?: React.ReactNode;  // 왼쪽 아이콘 slot
  text?: React.ReactNode;              // 텍스트 slot
  normalResponsive2?: React.ReactNode; // 오른쪽 아이콘 slot (optional)
}

// 3개의 slot만 생성됨 ✓
function Headersub({ normalResponsive, text, normalResponsive2 }: HeadersubProps) {
  return (
    <div css={HeadersubCss}>
      {normalResponsive}
      {text}
      {normalResponsive2}  {/* Basic variant에서는 없음 */}
    </div>
  );
}
```

#### 테스트

`test/compiler/nodeMatherChildPattern.test.ts`

---

### 24. SLOT prop 조건부 스타일 누락 문제

#### 문제

SLOT prop의 존재 여부에 따른 조건부 스타일이 렌더링되지 않음. Headerroot 컴포넌트에서 `rightIcon` slot의 유무에 따라 다른 padding, gap, justify-content, align-items가 적용되어야 하는데 모두 무시됨.

```typescript
// 기대: rightIcon이 있을 때와 없을 때 다른 레이아웃
interface HeaderrootProps {
  leftIcon?: React.ReactNode;
  text?: React.ReactNode;
  rightIcon?: React.ReactNode;  // optional slot
}

// 문제: rightIcon 유무와 관계없이 동일한 스타일 적용
<div css={HeaderrootCss}>  {/* padding, gap 등이 누락됨 */}
  {leftIcon}
  {text}
  {rightIcon}
</div>
```

#### 원인

1. **`_FinalAstTree.ts`의 `_removeSlotPropsDynamicStyles` 함수**
   - SLOT 변환 시 해당 prop과 연관된 모든 dynamic styles를 완전히 삭제
   - Boolean prop에서 SLOT으로 변환될 때 조건부 스타일이 제거됨

2. **Emotion CSS 템플릿 리터럴의 객체 보간 문제**
   - JavaScript 객체를 CSS 템플릿 리터럴에 직접 보간하면 `[object Object]`로 변환됨
   - `css\`${dynamicStyles}\`` 방식으로는 조건부 스타일을 적용할 수 없음

```typescript
// 문제가 되는 코드
const HeaderrootCss = css`
  ${dynamicStyles}  // { padding: "16px 24px" } → "[object Object]"
`;
```

#### 해결

**SLOT prop에 대한 별도 CSS 변수 생성 패턴**:

1. `_FinalAstTree.ts`: `_removeSlotPropsDynamicStyles` → `_convertSlotPropsDynamicStyles`로 변경
   - 조건을 삭제하지 않고 변환: `props.X === "True"` → `props.X != null`
   - SLOT prop의 유무를 검사하는 조건으로 변경

2. `GenerateStyles.ts`: SLOT prop용 별도 CSS 변수 생성
   - `_filterSlotDynamicStyles` 메서드 추가
   - 각 SLOT prop에 대해 `${ComponentName}With${PropName}Css`, `${ComponentName}Without${PropName}Css` 생성

3. `EmotionStrategy.ts`: CSS 배열로 조건부 스타일 조합
   - base CSS + SLOT prop별 조건부 CSS를 배열로 결합
   - `css={[baseCss, prop != null ? withPropCss : withoutPropCss]}`

**수정 파일**: `_FinalAstTree.ts`

```typescript
private _convertSlotPropsDynamicStyles(node: TempAstTreeNode): void {
  const slotProps = this._getSlotPropsFromNode(node);
  if (!slotProps.length) return;

  const slotPropNames = new Set(slotProps.map((p) => p.propName));

  // dynamicStyles에서 slot prop 관련 조건 변환
  node.dynamicStyles = node.dynamicStyles.map((ds) => {
    const transformedConditions = ds.conditions.map((cond) => {
      if (slotPropNames.has(cond.propName) && cond.comparison === "===") {
        // "True"/"False" 비교를 null 체크로 변환
        return this._convertSlotCondition(cond);
      }
      return cond;
    });

    return { ...ds, conditions: transformedConditions };
  });
}

private _convertSlotCondition(cond: DynamicStyleCondition): DynamicStyleCondition {
  if (cond.value === "True") {
    return { ...cond, comparison: "!=", value: "null" };
  } else if (cond.value === "False") {
    return { ...cond, comparison: "==", value: "null" };
  }
  return cond;
}
```

**수정 파일**: `GenerateStyles.ts`

```typescript
private _createRecordObjects(rootNode: FinalAstTreeNode): ts.VariableStatement[] {
  const statements: ts.VariableStatement[] = [];

  // SLOT prop dynamic styles 필터링
  const slotPropDynamicStyles = this._filterSlotDynamicStyles(rootNode);

  // 각 SLOT prop에 대해 별도 CSS 변수 생성
  for (const [propName, { withStyles, withoutStyles }] of Object.entries(slotPropDynamicStyles)) {
    const withVarName = `${rootNode.name}With${this._capitalize(propName)}Css`;
    const withoutVarName = `${rootNode.name}Without${this._capitalize(propName)}Css`;

    statements.push(this._createCssVariable(withVarName, withStyles));
    statements.push(this._createCssVariable(withoutVarName, withoutStyles));
  }

  return statements;
}

private _filterSlotDynamicStyles(node: FinalAstTreeNode) {
  const result: Record<string, { withStyles: CssStyle; withoutStyles: CssStyle }> = {};

  for (const ds of node.dynamicStyles) {
    const slotCondition = ds.conditions.find(
      (c) => c.comparison === "!=" && c.value === "null"
    );

    if (slotCondition) {
      if (!result[slotCondition.propName]) {
        result[slotCondition.propName] = { withStyles: {}, withoutStyles: {} };
      }

      const isWithCondition = slotCondition.comparison === "!=";
      const target = isWithCondition
        ? result[slotCondition.propName].withStyles
        : result[slotCondition.propName].withoutStyles;

      Object.assign(target, ds.styles);
    }
  }

  return result;
}
```

**수정 파일**: `EmotionStrategy.ts`

```typescript
public createStyleAttribute(node: FinalAstTreeNode): ts.JsxAttribute {
  const baseVarName = `${node.name}Css`;

  // SLOT prop dynamic styles가 있는지 확인
  const slotPropDynamicStyles = this._getSlotPropDynamicStyles(node);

  if (slotPropDynamicStyles.length === 0) {
    // 단일 CSS 변수
    return ts.factory.createJsxAttribute(
      ts.factory.createIdentifier("css"),
      ts.factory.createJsxExpression(
        undefined,
        ts.factory.createIdentifier(baseVarName)
      )
    );
  }

  // CSS 배열 생성
  const cssArray = ts.factory.createArrayLiteralExpression([
    ts.factory.createIdentifier(baseVarName),
    ...slotPropDynamicStyles.map((propName) =>
      ts.factory.createConditionalExpression(
        ts.factory.createBinaryExpression(
          ts.factory.createIdentifier(propName),
          ts.SyntaxKind.ExclamationEqualsToken,
          ts.factory.createNull()
        ),
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        ts.factory.createIdentifier(`${node.name}With${this._capitalize(propName)}Css`),
        ts.factory.createToken(ts.SyntaxKind.ColonToken),
        ts.factory.createIdentifier(`${node.name}Without${this._capitalize(propName)}Css`)
      )
    )
  ]);

  return ts.factory.createJsxAttribute(
    ts.factory.createIdentifier("css"),
    ts.factory.createJsxExpression(undefined, cssArray)
  );
}
```

#### 결과

```typescript
// 생성된 코드
const HeaderrootCss = css`
  display: flex;
  flex-direction: row;
`;

const HeaderrootWithRightIconCss = css`
  padding: 16px 24px;
  justify-content: center;
  align-items: flex-start;
  gap: 245px;
`;

const HeaderrootWithoutRightIconCss = css`
  padding: 16px 301px 16px 24px;
  align-items: center;
`;

// JSX에서 CSS 배열로 조건부 스타일 적용
function Headerroot({ leftIcon, text, rightIcon }: HeaderrootProps) {
  return (
    <div css={[
      HeaderrootCss,
      rightIcon != null
        ? HeaderrootWithRightIconCss
        : HeaderrootWithoutRightIconCss,
    ]}>
      {leftIcon}
      {text}
      {rightIcon}
    </div>
  );
}
```

#### 테스트

`test/compiler/slotDynamicStyles.test.ts`

---

### 25. SVG 아이콘 색상이 거의 흰색으로 렌더링되는 문제

#### 문제

SVG 아이콘이 검은색 대신 거의 흰색(`rgb(230, 237, 243)`)으로 렌더링됨.

```
Figma 원본: 검은색 SVG 아이콘 (#000000)
잘못된 렌더링: 거의 흰색 (rgb(230, 237, 243))
```

브라우저 DevTools 확인 결과:
```html
<svg fill="currentColor" ...>
  <path fill="currentColor"/>
</svg>
```

**문제 원인**: `fill="currentColor"`는 부모 요소의 `color` CSS 속성 값을 사용하는데, 부모에 `color`가 없으면 브라우저 기본값(User Agent Stylesheet)을 사용함.

#### 원인

**`SvgToJsx.ts`에서 모든 fill 속성을 `currentColor`로 변환**:

```typescript
// SvgToJsx.ts (기존 코드)
if (attrName === "fill" && this._isColorValue(attrValue)) {
  finalValue = "currentColor";  // 모든 색상을 currentColor로 변환
}
```

**렌더링 문제**:
1. SVG의 `fill="currentColor"` 설정됨
2. 부모 컴포넌트에 `color` CSS 속성 없음
3. 브라우저가 기본 색상 적용 → `rgb(230, 237, 243)` (거의 흰색)

이 로직은 **이슈 #4 (State별 SVG 아이콘 색상 다름)**를 해결하기 위해 추가된 것이었지만:
- State별로 다른 아이콘 색상이 필요한 경우: 부모에 `color` CSS 추가 (이슈 #4의 해결책)
- State별로 같은 아이콘 색상인 경우: 부모에 `color` CSS 없음 → 렌더링 문제 발생

#### 해결

**원본 fill 색상을 유지하도록 수정**:

`currentColor` 변환을 제거하고 Figma 원본의 fill 색상을 그대로 사용.

**수정 파일**: `src/frontend/ui/domain/compiler/core/react-generator/generate-component/jsx-tree/SvgToJsx.ts`

```typescript
// line 324-327
if (attrName === "fill" && attrValue === "currentColor") {
  finalValue = "currentColor";
} else if (attrName === "fill" && this._isColorValue(attrValue)) {
  finalValue = attrValue;  // 원본 색상 유지
}
```

**핵심 변경사항**:
1. `fill="currentColor"`인 경우만 그대로 유지
2. 다른 색상 값(`#000000`, `rgb(0,0,0)` 등)은 원본 그대로 유지
3. 부모에 `color` CSS가 없어도 올바르게 렌더링됨

#### 결과

```tsx
// 생성된 코드
<svg viewBox="0 0 24 24" fill="none">
  <path d="M..." fill="#000000"/>  {/* 원본 색상 유지 */}
</svg>
```

브라우저 렌더링:
| 항목 | 기존 | 수정 후 | 상태 |
|------|------|---------|------|
| SVG fill | `currentColor` → `rgb(230, 237, 243)` | `#000000` | ✓ |
| 부모 color CSS | 필요 (없으면 렌더링 문제) | 불필요 | ✓ |
| 아이콘 색상 | 거의 흰색 | 검은색 | ✓ |

#### 테스트

`test/compiler/svgToJsx.test.ts`

```typescript
test("단일 색상 SVG는 원래 색상을 유지한다", () => {
  const svg = '<svg><path d="M0 0" fill="#0050FF"/></svg>';
  const result = svgToJsx.convert(svg);
  const code = printJsx(result);

  // 원래 색상 유지 (currentColor는 부모에 color CSS가 없으면 렌더링 문제 발생)
  expect(code).toContain('fill="#0050FF"');
});
```

---

### 26. COMPONENT_SET variant별 SVG 매핑 문제

#### 문제

동일 COMPONENT_SET의 variant들이 `INSTANCE_SWAP`으로 다른 SVG 아이콘을 사용하는 경우, 모든 variant가 첫 번째 variant의 SVG만 사용함.

```
Figma 구조:
- NormalResponsive (COMPONENT_SET)
  ├── Size=Normal variant
  │   └── INSTANCE_SWAP → Arrow Icon (viewBox="0 0 20 16")
  └── Size=Large variant
      └── INSTANCE_SWAP → Dotted Square Icon (viewBox="0 0 32 32")

기대: size === "Normal" ? <ArrowSvg/> : <DottedSquareSvg/>
실제: 모든 variant에서 <ArrowSvg/> 렌더링 (첫 번째 variant만)
```

#### 원인

**`_FinalAstTree.ts`에서 루트 노드 처리 시 `_variantSvgs` 체크가 실행되지 않음**:

```typescript
// _FinalAstTree.ts (기존 코드 line 567-588)
if (isRootDocument) {
  // 루트 노드 처리
  // ...
  return;  // ❌ 여기서 조기 종료 → _variantSvgs 로직에 도달하지 않음
}

// _variantSvgs 체크 (line 590-612)
// ❌ 루트 노드는 위에서 return되어 이 로직에 도달하지 않음
const variantSvgs = this._variantSvgs[node.id];
if (variantSvgs) {
  // variant별 SVG 매핑 로직
}
```

**`_variantSvgs` 구조**:
```typescript
_variantSvgs = {
  "INSTANCE_ID": {
    "Size=Normal": "SVG_ID_1",    // Arrow Icon
    "Size=Large": "SVG_ID_2",     // Dotted Square Icon
  }
}
```

**문제 시나리오**:
1. `_variantSvgs`에 variant별 SVG 매핑이 올바르게 수집됨
2. 루트 노드 처리 블록에서 `return`문으로 조기 종료
3. `_variantSvgs` 체크 로직에 도달하지 않음
4. `node.metaData.vectorSvgs` 설정되지 않음
5. 모든 variant가 첫 번째 SVG만 사용

#### 해결

**루트 노드 처리 블록 내에서 `_variantSvgs` 체크 추가**:

**수정 파일**: `src/frontend/ui/domain/compiler/core/ast-tree/_FinalAstTree.ts`

```typescript
// line 567-588 (루트 노드 처리 블록)
if (isRootDocument) {
  // 기존 루트 노드 처리 로직
  // ...

  // ✅ _variantSvgs 체크 추가
  const variantSvgs = this._variantSvgs[node.id];
  if (variantSvgs && Object.keys(variantSvgs).length > 0) {
    const firstVariantName = Object.keys(variantSvgs)[0];
    const firstSvgId = variantSvgs[firstVariantName];

    // variant별로 다른 SVG가 있는지 확인
    const hasDifferentSvgs = Object.values(variantSvgs).some(
      (svgId) => svgId !== firstSvgId
    );

    if (hasDifferentSvgs) {
      // variant별 SVG 매핑 설정
      node.metaData.vectorSvgs = variantSvgs;
    } else {
      // 모든 variant가 같은 SVG 사용 → 단일 SVG
      node.metaData.vectorSvg = this.specDataManager.getVectorSvg(firstSvgId);
    }
  }

  return;
}
```

**핵심 변경사항**:
1. 루트 노드 처리 블록 내에 `_variantSvgs` 체크 로직 추가
2. variant별로 다른 SVG가 있으면 `node.metaData.vectorSvgs` 설정
3. 모든 variant가 같은 SVG면 `node.metaData.vectorSvg` 설정 (단일 SVG)

**fallback 로직 추가**:

**수정 파일**: `src/frontend/ui/domain/compiler/manager/VariantEnrichManager.ts`

```typescript
// variant별 SVG 가져오기 (fallback 지원)
const svgId = variantSvgs[variantName];
const svg = this.specDataManager.getVectorSvg(svgId);

if (!svg) {
  // fallback: 첫 번째 variant의 SVG 사용
  const firstVariantName = Object.keys(variantSvgs)[0];
  const firstSvgId = variantSvgs[firstVariantName];
  svg = this.specDataManager.getVectorSvg(firstSvgId);
}
```

**수정 파일**: `src/frontend/ui/domain/compiler/manager/SpecDataManager.ts`

```typescript
// getFirstVectorSvgByInstanceId 메서드 추가
public getFirstVectorSvgByInstanceId(instanceId: string): string | undefined {
  const spec = this.getSpecById(instanceId);
  if (!spec) return undefined;

  const mainComponentId = spec.mainComponent?.id;
  if (!mainComponentId) return undefined;

  const mainComponent = this.getSpecById(mainComponentId);
  if (!mainComponent) return undefined;

  // mainComponent의 첫 번째 VECTOR 자식 찾기
  const firstVectorId = Object.keys(mainComponent.children || {}).find((childId) => {
    const child = this.getSpecById(childId);
    return child?.type === "VECTOR";
  });

  if (!firstVectorId) return undefined;
  return this.getVectorSvg(firstVectorId);
}
```

#### 결과

```typescript
// 생성된 코드
const NormalResponsiveSvgs: Record<
  NonNullable<NormalResponsiveProps["size"]>,
  React.ReactNode
> = {
  Normal: (
    <svg viewBox="0 0 20 16" fill="none">
      <path d="M..." fill="black"/>  {/* Arrow Icon */}
    </svg>
  ),
  Large: (
    <svg viewBox="0 0 32 32" fill="none">
      <rect d="M..." fill="black"/>  {/* Dotted Square Icon */}
    </svg>
  ),
};

function NormalResponsive({ size }: NormalResponsiveProps) {
  return (
    <div css={NormalResponsiveCss}>
      {NormalResponsiveSvgs[size]}  {/* size에 따라 다른 SVG 렌더링 */}
    </div>
  );
}
```

브라우저 렌더링:
| size | SVG | 상태 |
|------|-----|------|
| Normal | Arrow Icon (viewBox="0 0 20 16") | ✓ |
| Large | Dotted Square Icon (viewBox="0 0 32 32") | ✓ |

#### 테스트

`test/compiler/variantSvg.test.ts`

```typescript
test("COMPONENT_SET의 다른 variant들이 서로 다른 SVG를 사용해야 한다", async () => {
  const compiler = new FigmaCodeGenerator(typedefaultRightIcontrueFixture);
  const code = await compiler.compile();

  expect(code).toContain("NormalResponsive");
  expect(code).toContain("size");

  // SVG가 있어야 함 (fill="black"으로 원본 색상 유지)
  expect(code).toContain("<svg");
  expect(code).toContain('fill="black"');

  // 조건부 SVG 렌더링: size prop에 따라 다른 SVG가 렌더링되어야 함
  expect(code).toContain('size === "Normal"');

  // 두 개의 서로 다른 SVG가 있어야 함
  const svgMatches = code.match(/<svg[^>]*viewBox="[^"]+"/g) || [];
  expect(svgMatches.length).toBeGreaterThanOrEqual(2);
});
```

---

### 27. 숫자로 시작하는 식별자 처리

#### 문제

Figma 노드 이름이 `063112`처럼 숫자로만 구성된 경우, JavaScript 식별자로 사용할 수 없어 컴파일 에러 발생:

```
SyntaxError: Unexpected number
SyntaxError: Octal literals are not allowed in strict mode
```

생성된 코드:
```typescript
// 잘못된 식별자
const 063112 = "...";  // ❌ SyntaxError

// Record key로 사용된 경우
const styles: Record<"063112", any> = {
  063112: { ... },  // ❌ SyntaxError
};
```

#### 원인

`toCamelCase` 함수가 숫자로 시작하는 결과에 대한 처리가 없었음:

```typescript
// 변환 전
export function toCamelCase(key: string) {
  const words = key.split(" ").filter(Boolean);
  const first = words[0].toLowerCase();  // "063112"
  const rest = words.slice(1).map(...).join("");

  return first + rest;  // "063112" 반환 → JavaScript 식별자로 사용 불가
}
```

JavaScript 식별자는 숫자로 시작할 수 없음 (ECMAScript spec).

#### 해결

**숫자로 시작하면 `_` prefix 추가**

**수정 파일**: `src/frontend/ui/domain/compiler/utils/normalizeString.ts`

```typescript
export function toCamelCase(key: string) {
  // ... (기존 변환 로직)

  const result = first + rest;

  // 숫자로 시작하면 앞에 _ 추가 (JavaScript 식별자는 숫자로 시작할 수 없음)
  if (/^[0-9]/.test(result)) {
    return "_" + result;
  }

  return result;
}
```

**결과**:

```typescript
// 올바른 식별자
const _063112 = "...";  // ✓

const styles: Record<"_063112", any> = {
  _063112: { ... },  // ✓
};
```

**적용 범위**:
- `toCamelCase`: prop 이름, style key 등
- `normalizeComponentName`: 컴포넌트 이름 (이미 처리됨)

---

### 28. CSS 변환 불가능한 State prop 보존

#### 문제

State variant에 "Error", "Insert", "Press" 등 CSS pseudo-class로 변환할 수 없는 상태가 있어도 state prop이 삭제되어, 런타임에 조건부 렌더링 불가:

```typescript
// state prop이 삭제되어 컴파일 에러
function InputBoxotp({ /* state prop 없음 */ }: Props) {
  return (
    <div>
      {props.state === "Error" && <ErrorMessage />}  {/* ❌ props.state 없음 */}
    </div>
  );
}
```

**State 종류**:
- **CSS 변환 가능**: Default, Hover, Pressed, Focus, Disabled → pseudo-class로 처리 → state prop 불필요
- **CSS 변환 불가**: Error, Insert, Press, Loading 등 → 런타임 조건 필요 → state prop 유지해야 함

#### 원인

`_refineStateProp` 함수가 state prop 삭제 여부를 순회 **전**에 결정:

```typescript
// 잘못된 로직
private _refineStateProp(astTree: FinalAstTree) {
  // 1. 모든 state를 CSS로 변환할 수 있다고 가정
  let shouldDeleteState = true;

  // 2. 노드 순회하며 state 조건 처리
  traverseBFS(astTree, (node) => {
    // visible condition에서 state 조건 제거
    if (node.visible.type === "condition") {
      // state === "Error" 조건도 무조건 제거
      node.visible = { type: "static", value: true };
    }
  });

  // 3. state prop 삭제 (순회 후에는 조건이 이미 제거됨)
  delete astTree.props["state"];
}
```

**문제점**:
1. 순회 중에 `state === "Error"` 조건을 제거
2. 순회 후에는 Error 조건이 남아있는지 확인할 방법 없음
3. state prop을 무조건 삭제
4. 생성된 코드에서 `props.state` 참조 → 컴파일 에러

#### 해결

**순회 중 플래그 수집 → 순회 후 state prop 삭제 여부 결정**

**수정 파일**: `src/frontend/ui/domain/compiler/core/ast-tree/_FinalAstTree.ts`

```typescript
private _refineStateProp(astTree: FinalAstTree) {
  const STATE_TO_PSEUDO: Record<string, string | null> = {
    Default: null,    // base로 이동
    Hover: ":hover",
    Pressed: ":active",
    // Error, Insert 등은 undefined (변환 불가)
  };

  // 1. 플래그 초기화
  let hasUnresolvableStateCondition = false;

  // 2. 노드 순회하며 조건 처리
  traverseBFS(astTree, (node) => {
    if (node.visible.type === "condition") {
      const conditionCode = generate(node.visible.condition);
      const stateOnlyMatch = conditionCode.match(/props\.state === ['"](\w+)['"]/);

      if (stateOnlyMatch) {
        const stateValue = stateOnlyMatch[1];  // "Error"
        const pseudoClass = STATE_TO_PSEUDO[stateValue];  // undefined

        if (pseudoClass === undefined) {
          // CSS 변환 불가 → condition 유지, 플래그 설정
          hasUnresolvableStateCondition = true;
        } else {
          // CSS 변환 가능 → visible: true로 변경
          node.visible = { type: "static", value: true };
        }
      }
    }
  });

  // 3. 플래그에 따라 state prop 삭제 여부 결정
  if (statePropName && !hasUnresolvableStateCondition) {
    delete astTree.props[statePropName];
  }
}
```

**핵심 변경사항**:
1. `hasUnresolvableStateCondition` 플래그 추가
2. 순회 중 CSS 변환 불가능한 state 발견 시 플래그 설정
3. 순회 후 플래그 확인하여 state prop 삭제 여부 결정

**결과**:

```typescript
// state prop 유지
type InputBoxotpProps = {
  state: "Default" | "Error" | "Insert" | "Press";
};

function InputBoxotp({ state }: InputBoxotpProps) {
  return (
    <div>
      {state === "Error" && <ErrorMessage />}  {/* ✓ 정상 동작 */}
      {state === "Insert" && <InsertIcon />}
    </div>
  );
}
```

### 29. Array.includes 패턴에서 state prop 누락

#### 문제

`visible` 조건에서 `["Insert", "Error"].includes(props.state)` 패턴을 사용할 때, `state` prop이 삭제되어 런타임 에러 발생:

```typescript
// 생성된 코드
function InputBoxstandard({ /* state prop 없음 */ }: Props) {
  return (
    <div>
      {["Insert", "Error"].includes(state) && <div>...</div>}
      {/* ❌ ReferenceError: state is not defined */}
    </div>
  );
}
```

**문제 상황**:
- `props.state === "Insert"` 패턴: state prop이 올바르게 보존됨 ✓
- `["Insert", "Error"].includes(props.state)` 패턴: state prop이 삭제됨 ✗

#### 원인

`_refineStateProp` 함수에서 `props.state === "..."` 패턴만 감지하고, `["..."].includes(props.state)` 패턴은 감지하지 못함:

```typescript
// 기존 코드
private _refineStateProp(astTree: FinalAstTree) {
  // State 단독 조건 패턴만 확인
  const stateOnlyMatch = conditionCode.match(
    /^props\.(?:state|State|states|States)\s*===\s*['"](\w+)['"]$/
  );

  if (stateOnlyMatch) {
    const stateValue = stateOnlyMatch[1];
    const pseudoClass = STATE_TO_PSEUDO[stateValue];  // "Insert" → undefined

    if (pseudoClass === undefined) {
      hasUnresolvableStateCondition = true;  // ✓ state prop 보존
    }
  }
  // ❌ Array.includes 패턴은 처리하지 않음
}
```

**문제점**:
1. `Array.includes` 패턴을 감지하지 못함
2. 배열 내 state 값들이 CSS 변환 불가능해도 감지 안됨
3. state prop이 삭제되어 `["Insert", "Error"].includes(state)` 코드가 에러 발생

#### 해결

**Array.includes 패턴 감지 로직 추가**

**수정 파일**: `src/frontend/ui/domain/compiler/core/ast-tree/_FinalAstTree.ts`

```typescript
private _refineStateProp(astTree: FinalAstTree) {
  const STATE_TO_PSEUDO: Record<string, string | null> = {
    Default: null,
    Hover: ":hover",
    Pressed: ":active",
    // "Insert", "Error" 등은 undefined (CSS 변환 불가)
  };

  let hasUnresolvableStateCondition = false;

  // Array.includes 패턴 추가
  const stateIncludesPattern =
    /\[([^\]]+)\]\.includes\(props\.(?:state|State|states|States)\)/;

  traverseBFS(astTree, (node) => {
    if (node.visible.type === "condition") {
      const conditionCode = generate(node.visible.condition);

      // 1. 기존 패턴: props.state === "..."
      const stateOnlyMatch = conditionCode.match(/^props\.state === ['"](\w+)['"]$/);

      // 2. 새 패턴: ["Insert", "Error"].includes(props.state)
      const includesMatch = conditionCode.match(stateIncludesPattern);

      if (stateOnlyMatch) {
        // ... 기존 로직
      } else if (includesMatch) {
        // Array.includes 패턴 처리
        const arrayContent = includesMatch[1];
        const stateValues = arrayContent.match(/["'](\w+)["']/g) || [];
        const extractedValues = stateValues.map((v) => v.replace(/["']/g, ""));

        // 배열 내 state 값 중 CSS 변환 불가능한 것이 있는지 확인
        const hasUnresolvable = extractedValues.some(
          (val) => STATE_TO_PSEUDO[val] === undefined
        );

        if (hasUnresolvable) {
          // "Insert", "Error" 등 포함 → state prop 유지
          hasUnresolvableStateCondition = true;
        } else {
          // 모두 CSS 변환 가능 → visible: true
          node.visible = { type: "static", value: true };
        }
      }
    }
  });

  // state prop 삭제 여부 결정
  if (statePropName && !hasUnresolvableStateCondition) {
    delete astTree.props[statePropName];
  }
}
```

**핵심 변경사항**:
1. `stateIncludesPattern` 정규식으로 `["..."].includes(props.state)` 패턴 감지
2. 배열 내 state 값들을 추출하여 CSS 변환 가능 여부 확인
3. 변환 불가능한 값이 하나라도 있으면 `hasUnresolvableStateCondition = true` 설정
4. state prop 보존하여 런타임 조건 처리 가능

**결과**:

```typescript
// state prop 유지됨
type InputBoxstandardProps = {
  state: "Normal" | "Insert" | "Error";
};

function InputBoxstandard({ state }: InputBoxstandardProps) {
  return (
    <div>
      {["Insert", "Error"].includes(state) && <div>...</div>}  {/* ✓ 정상 동작 */}
    </div>
  );
}
```

---

_Last Updated: 2026-01-24_
