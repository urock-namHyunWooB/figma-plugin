# 컴파일 파이프라인 상세 문서

> Figma 데이터가 React 컴포넌트 코드로 변환되는 전체 과정을 단계별로 설명합니다.

## 목차

1. [파이프라인 개요](#파이프라인-개요)
2. [Phase 1: 데이터 로딩](#phase-1-데이터-로딩)
3. [Phase 2: SuperTree 생성](#phase-2-supertree-생성)
4. [Phase 3: TempAstTree 생성](#phase-3-tempasttree-생성)
5. [Phase 4: FinalAstTree 생성](#phase-4-finalasttree-생성)
6. [Phase 5: 코드 생성](#phase-5-코드-생성)
7. [Phase 6: 의존성 번들링](#phase-6-의존성-번들링)

---

## 파이프라인 개요

### 전체 흐름도

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FigmaNodeData (입력)                           │
│  ├── info.document (SceneNode 트리)                                     │
│  ├── styleTree (RenderTree - CSS 스타일)                                │
│  └── dependencies (외부 컴포넌트)                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Phase 1: 데이터 로딩                                │
│  SpecDataManager: HashMap 구축, 데이터 접근 레이어                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌──────────────────────────────┐               ┌──────────────────────────┐
│   Phase 2: SuperTree 생성     │               │   PropsExtractor         │
│   Variant 병합                │               │   Props 추출             │
└──────────────────────────────┘               └──────────────────────────┘
            │                                               │
            └───────────────────────┬───────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Phase 3: TempAstTree 생성                           │
│  Props 바인딩, 스타일 주입, Visible 조건, Position 처리                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Phase 4: FinalAstTree 생성                          │
│  노드 정리, 메타데이터, Props 정규화, 외부 컴포넌트, Slot 처리              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Phase 5: 코드 생성                                  │
│  ReactGenerator → TypeScript AST → Prettier → 코드 문자열                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Phase 6: 의존성 번들링                              │
│  DependencyManager: 재귀 컴파일, import 정리, 변수명 충돌 해결            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      React Component Code (출력)                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 데이터 로딩

### 담당 클래스
`SpecDataManager`

### 입력
```typescript
interface FigmaNodeData {
  info: {
    document: SceneNode;              // Figma 노드 트리
    components: Record<string, any>;  // 컴포넌트 메타데이터
  };
  styleTree: RenderTree;              // CSS 스타일 정보
  dependencies?: Record<string, FigmaNodeData>;  // 외부 컴포넌트
  imageUrls?: Record<string, string>; // 이미지 URL 매핑
}
```

### 처리 내용

| 작업 | 설명 |
|------|------|
| **HashMap 구축** | `specHashMap[id] → SceneNode` 매핑 |
| **RenderTree HashMap** | `renderTreeHashMap[id] → RenderTree` 매핑 |
| **이미지 URL 교체** | `<path-to-image>` placeholder → 실제 URL |

### 출력
- O(1) 조회 가능한 데이터 접근 레이어

---

## Phase 2: SuperTree 생성

### 담당 클래스
`CreateSuperTree`

### 입력
- `RenderTree` (styleTree)
- `SpecDataManager`
- `NodeMatcher`

### 처리 내용

#### 2.1 COMPONENT_SET인 경우

```
COMPONENT_SET (Button)
├── Variant 1: Size=Large, State=Default
├── Variant 2: Size=Large, State=Hover
├── Variant 3: Size=Small, State=Default
└── Variant 4: Size=Small, State=Hover
```

**병합 알고리즘**:
1. 첫 번째 Variant를 pivot으로 설정
2. 나머지 Variant를 BFS로 순회
3. 같은 depth에서 IoU >= 0.8인 노드를 "같은 노드"로 판정
4. 같은 노드면 `mergedNode` 배열에 추가
5. 새로운 노드면 부모를 찾아 children에 추가

```typescript
// SuperTreeNode 구조
interface SuperTreeNode {
  id: string;
  type: string;
  name: string;
  children: SuperTreeNode[];
  mergedNode: Array<{           // 병합된 Variant 노드들
    id: string;
    name: string;
    variantName: string | null; // "Size=Large, State=Default"
  }>;
}
```

#### 2.2 일반 노드인 경우 (COMPONENT, FRAME, INSTANCE)
- RenderTree를 그대로 SuperTreeNode로 변환

### 출력
- 모든 Variant가 병합된 단일 `SuperTree`

---

## Phase 3: TempAstTree 생성

### 담당 클래스
`_TempAstTree`

### 입력
- `SuperTree`
- `refinedProps` (PropsExtractor에서 추출)
- `SpecDataManager`

### 처리 단계

#### 3.1 createTempAstTree
SuperTree → TempAstTree 기본 변환

```typescript
interface TempAstTree {
  id: string;
  type: string;
  name: string;
  props: PropsDef;           // 루트만 props 할당
  style: {
    base: Record<string, string>;
    dynamic: Array<{ condition: ConditionNode; style: Record<string, string> }>;
  };
  visible: VisibleValue | null;
  children: TempAstTree[];
  mergedNode: MergedNode[];
}
```

#### 3.2 updateMergedNode
각 mergedNode에 RenderTree 데이터(cssStyle) 병합

#### 3.3 UpdateStyle
Variant별 스타일 차이 분석:

```
mergedNode[0]: Size=Large  → { height: 48px, padding: 16px }
mergedNode[1]: Size=Small  → { height: 32px, padding: 8px }
```

**결과**:
```typescript
style: {
  base: { padding: "8px" },  // 공통 스타일 (또는 빈 객체)
  dynamic: [
    { condition: "props.size === 'Large'", style: { height: "48px", padding: "16px" } },
    { condition: "props.size === 'Small'", style: { height: "32px" } }
  ]
}
```

#### 3.4 updateNormalizeStyle
복합 조건(Size && State)을 단일 prop 조건으로 분리:

```
Before: props.size === 'Large' && props.state === 'Hover' → { height: 48px, background: blue }
After:  props.size === 'Large' → { height: 48px }
        props.state === 'Hover' → { background: blue }
```

#### 3.5 updatePositionStyles
Auto Layout이 아닌 컨테이너의 자식에게 absolute position 추가:

```typescript
// GROUP 또는 layoutMode === "NONE"인 FRAME
if (isAbsolutePositioningContainer(parent)) {
  child.style.base["position"] = "absolute";
  child.style.base["left"] = `${relativeX}px`;
  child.style.base["top"] = `${relativeY}px`;
}
```

#### 3.6 updateVisible
노드 가시성 조건 추론:

| 케이스 | 결과 |
|--------|------|
| 명시적 바인딩 (`componentPropertyReferences.visible`) | `null` (props.visible에서 처리) |
| 모든 Variant에서 존재 | `{ type: "static", value: true }` |
| 일부 Variant에서만 존재 | `{ type: "condition", condition: ... }` |

**조건 추론 알고리즘**:
1. 존재하지 않는 Variant들의 공통점 찾기
2. 예: `Left Icon=False`인 Variant에서만 없음 → `props.leftIcon === 'True'`

#### 3.7 updateConditionalWrapper
조건부 래퍼 패턴 감지:

```
Frame (visible: leftIcon || rightIcon)  ← isConditionalWrapper = true
  └── Text (visible: static true)
```

#### 3.8 updateProps
`componentPropertyReferences` 바인딩 주입

### 출력
- Props/Style/Visible이 설정된 `TempAstTree`

---

## Phase 4: FinalAstTree 생성

### 담당 클래스
`_FinalAstTree`

### 입력
- `TempAstTree`
- `SpecDataManager`

### 처리 단계

#### 4.1 createFinalAstTree
TempAstTree → FinalAstTree 기본 변환 (parent 참조 추가)

#### 4.2 updateCleanupNodes
불필요한 노드 삭제:

| 조건 | 설명 |
|------|------|
| `absoluteBoundingBox.height === 0` | 높이가 0인 노드 |
| `id.startsWith("I")` | INSTANCE 내부 노드 (루트가 INSTANCE가 아닌 경우) |
| `visible === false` (명시적 바인딩 없음) | 항상 숨겨진 노드 |

#### 4.3 updateMetaData
노드별 semanticRole 할당:

| Figma Type | semanticRole |
|------------|--------------|
| TEXT | `"text"` |
| INSTANCE | `"icon"` |
| VECTOR, LINE, ELLIPSE... | `"vector"` |
| FRAME, GROUP, RECTANGLE | `"container"` |
| 루트 (버튼 컴포넌트) | `"button"` |
| 루트 (일반) | `"root"` |

추가 처리:
- TEXT 노드: `characters`, `textSegments` (부분 스타일링) 저장
- VECTOR 노드: `vectorSvg` 저장
- INSTANCE 노드: 내부 Vector들의 SVG 합성

#### 4.4 updateProps

**4.4.1 _normalizePropsName**
```
"Left Icon" → "leftIcon"
"Size" → "size"
```

**4.4.2 _normalizePropsType**
```typescript
// VARIANT type이지만 True/False 옵션만 있으면 BOOLEAN으로 변환
{ type: "VARIANT", variantOptions: ["True", "False"] }
→ { type: "BOOLEAN", defaultValue: true }
```

**4.4.3 _refinePropsForNativeAttr**
네이티브 HTML 속성과 충돌하는 prop 이름 변경:
```
"disabled" (prop) + "disabled" (HTML attr)
→ "customDisabled"
```

**4.4.4 _refineStateProp**
`State` prop을 CSS pseudo-class로 변환:

```
State=Hover → :hover
State=Pressed → :active
State=Disabled → :disabled
State=Default → base style로 이동
```

**4.4.5 _refineComponentLikeProp**
Boolean/VARIANT(True/False) prop을 Slot으로 변환:

```
// 감지 조건
1. BOOLEAN 타입 또는 True/False VARIANT
2. 해당 prop이 visible condition에 바인딩된 INSTANCE 노드가 있음
3. 스타일 변경만이 아닌 트리 구조 변경

// 변환
{ type: "BOOLEAN", defaultValue: true }
→ { type: "SLOT", defaultValue: null, originalType: "BOOLEAN" }
```

**4.4.6 _refinePropsForButton**
버튼 컴포넌트에 `text` prop 자동 생성:
- 내부 TEXT 노드 감지
- `text` prop 추가
- TEXT 노드에 바인딩

#### 4.5 updateExternalComponents
INSTANCE 노드를 외부 컴포넌트 참조로 변환:

```typescript
// ArraySlot이 아닌 경우 → slot으로 처리
node.isSlot = true;
node.slotName = "leftIcon";

// ArraySlot인 경우 (2개 이상 반복) → externalComponent로 처리
node.externalComponent = {
  componentId: "...",
  componentSetId: "...",
  componentName: "SelectItem",
  props: { label: "Option 1", selected: true }
};
```

### 출력
- 최종 `FinalAstTree`

---

## Phase 5: 코드 생성

### 담당 클래스
`ReactGenerator`

### 입력
- `FinalAstTree`
- `ArraySlot[]`
- `ReactGeneratorOptions` (스타일 전략, 디버그 모드)

### 처리 단계

#### 5.1 GenerateImports
필요한 import 문 생성:

```typescript
import { css } from "@emotion/react";
// 또는
import clsx from "clsx";
```

외부 컴포넌트 import:
```typescript
import { SelectItem } from "./SelectItem";
```

#### 5.2 GenerateInterface
Props 인터페이스 생성:

```typescript
export interface ButtonProps {
  size?: "large" | "small";
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  text?: string;
  onClick?: () => void;
}
```

#### 5.3 GenerateStyles
스타일 변수 생성 (Emotion):

```typescript
const containerStyle = css`
  display: flex;
  align-items: center;
  padding: 12px 24px;
  ${props.size === "large" && css`
    height: 48px;
  `}
`;
```

또는 Tailwind:
```typescript
const containerClassName = clsx(
  "flex items-center px-6 py-3",
  props.size === "large" && "h-12"
);
```

#### 5.4 GenerateComponent
컴포넌트 함수 생성:

```typescript
export const Button = ({
  size = "large",
  disabled = false,
  leftIcon,
  text = "Button",
  onClick
}: ButtonProps) => {
  return (
    <button css={containerStyle} onClick={onClick} disabled={disabled}>
      {leftIcon && <span css={iconStyle}>{leftIcon}</span>}
      <span css={textStyle}>{text}</span>
    </button>
  );
};

export default Button;
```

#### 5.5 TypeScript Printer
`ts.createPrinter()`로 AST → 코드 문자열 변환

#### 5.6 Prettier
코드 포맷팅 (테스트 환경에서는 스킵)

### 출력
- 포맷팅된 React 컴포넌트 코드 문자열

---

## Phase 6: 의존성 번들링

### 담당 클래스
`DependencyManager`

### 입력
- 메인 컴포넌트 코드
- `dependencies` (FigmaNodeData 내)

### 처리 단계

#### 6.1 의존성 컴파일
각 dependency를 재귀적으로 컴파일:

```typescript
for (const [componentSetId, group] of Object.entries(groupedDeps)) {
  const depCompiler = new FigmaCompiler(depSpec, options);
  const depCode = await depCompiler.compile(componentName);
  compiledDependencies.push({ name, code: depCode });
}
```

#### 6.2 변수명 충돌 해결
같은 이름의 스타일 변수 감지 및 접두사 추가:

```typescript
// 메인: const containerStyle = ...
// 의존성: const containerStyle = ...

// 변환 후
// 메인: const containerStyle = ...
// 의존성: const SelectItem_containerStyle = ...
```

#### 6.3 Import 정리
중복 import 제거 및 병합:

```typescript
// Before
import { css } from "@emotion/react";
import { css } from "@emotion/react";

// After
import { css } from "@emotion/react";
```

#### 6.4 코드 번들링
순서대로 코드 결합:

```typescript
// === 번들된 코드 구조 ===

// 1. 공통 Imports
import { css } from "@emotion/react";

// 2. 의존성 컴포넌트들 (export 제거)
const SelectItem_containerStyle = css`...`;
const SelectItem = ({ ... }) => { ... };

// 3. 메인 컴포넌트
const containerStyle = css`...`;
export const Button = ({ ... }) => {
  return (
    <div>
      <SelectItem label="Option 1" />
    </div>
  );
};

export default Button;
```

### 출력
- 모든 의존성이 포함된 단일 파일 코드

---

## 데이터 변환 예시

### 입력: Figma Button Component

```json
{
  "info": {
    "document": {
      "type": "COMPONENT_SET",
      "name": "Button",
      "children": [
        { "name": "Size=Large, State=Default", "children": [...] },
        { "name": "Size=Small, State=Hover", "children": [...] }
      ],
      "componentPropertyDefinitions": {
        "Size": { "type": "VARIANT", "variantOptions": ["Large", "Small"] },
        "Left Icon": { "type": "BOOLEAN", "defaultValue": true }
      }
    }
  },
  "styleTree": {
    "id": "root",
    "cssStyle": { "display": "flex", "padding": "12px" },
    "children": [...]
  }
}
```

### 출력: React Component

```tsx
import { css } from "@emotion/react";

export interface ButtonProps {
  size?: "large" | "small";
  leftIcon?: React.ReactNode;
  text?: string;
  onClick?: () => void;
}

const containerStyle = css`
  display: flex;
  padding: 12px;
`;

const largeStyle = css`
  height: 48px;
`;

const smallStyle = css`
  height: 32px;
`;

export const Button = ({
  size = "large",
  leftIcon,
  text = "Click me",
  onClick,
}: ButtonProps) => {
  return (
    <button
      css={[containerStyle, size === "large" ? largeStyle : smallStyle]}
      onClick={onClick}
    >
      {leftIcon && <span css={iconStyle}>{leftIcon}</span>}
      <span css={textStyle}>{text}</span>
    </button>
  );
};

export default Button;
```

---

## 파이프라인 확장 포인트

| 확장 포인트 | 위치 | 설명 |
|-------------|------|------|
| 스타일 전략 추가 | `style-strategy/` | CSS Modules, Styled Components 등 |
| 노드 타입 지원 | `CreateSuperTree`, `_FinalAstTree` | 새로운 Figma 노드 타입 |
| Props 변환 규칙 | `_FinalAstTree.updateProps` | 커스텀 prop 처리 |
| 코드 생성 템플릿 | `ReactGenerator` | Vue, Svelte 등 다른 프레임워크 |

---

*Last Updated: 2026-01*
