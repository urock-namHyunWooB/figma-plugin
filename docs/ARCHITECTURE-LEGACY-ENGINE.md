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
8. [테스트](#테스트)

> **Note**: 해결된 이슈들은 `docs/issues/` 폴더에 개별 파일로 정리되어 있습니다.

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
src/frontend/ui/domain/code-generator/
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

_Last Updated: 2026-02-06_
