# Code Generator 핵심 개념

> Figma 디자인을 React 코드로 변환하는 과정의 개념적 이해

---

## 전체 흐름

```
Figma 디자인 데이터 → 의존성 분석 → 정규화 → 중간 표현(IR) → React 코드
```

4개의 레이어가 순차적으로 실행되며, 각 레이어는 **단일 책임**을 가집니다.

| 레이어 | 핵심 질문 | 결과물 |
|--------|----------|--------|
| **DependencyAnalyzer** | "이 컴포넌트가 어떤 다른 컴포넌트에 의존하는가?" | 컴파일 순서 |
| **DataPreparer** | "이 데이터를 어떻게 빠르게 조회할 수 있을까?" | 조회 최적화된 데이터 |
| **TreeBuilder** | "이 디자인은 어떤 UI 컴포넌트를 표현하는가?" | 플랫폼 독립적 UI 구조 |
| **CodeEmitter** | "이 구조를 React로 어떻게 표현할까?" | TypeScript/React 코드 |

---

## Layer 0: DependencyAnalyzer

### 목적
컴포넌트 간 **의존성 관계를 분석**하고 **컴파일 순서를 결정**합니다.

### 왜 필요한가?
버튼 컴포넌트가 아이콘 컴포넌트를 사용한다면, 아이콘을 먼저 컴파일해야 버튼에서 import할 수 있습니다.

```
Dialog → Button → Icon
        ↘ Badge ↗
```

위 경우 컴파일 순서: `Icon → Badge → Button → Dialog`

### 하는 일
- **의존성 그래프 구축**: 어떤 컴포넌트가 어떤 컴포넌트를 참조하는지 분석
- **순환 의존성 감지**: A → B → C → A 같은 순환 참조 발견 시 에러
- **토폴로지 정렬**: 의존되는 컴포넌트부터 순서대로 정렬

### 핵심 개념
> "의존받는 컴포넌트를 먼저 컴파일해야 import 구문을 생성할 수 있다"

INSTANCE 노드를 탐색하여 외부 컴포넌트 참조를 찾고, 이를 그래프로 구축합니다.

---

## Layer 1: DataPreparer

### 목적
Figma에서 받은 원본 데이터를 **효율적으로 조회할 수 있는 형태**로 변환합니다.

### 하는 일
- **원본 보호**: 깊은 복사로 원본 데이터 변질 방지
- **빠른 조회**: 노드 ID → 노드 데이터를 O(1)로 찾을 수 있는 HashMap 구축
- **이름 정규화**: Figma의 prop 이름을 JavaScript 친화적인 camelCase로 변환

### 핵심 개념
> "나중에 특정 노드를 찾아야 할 때, 트리 전체를 순회하지 않고 바로 찾을 수 있게 준비한다"

예를 들어 "ID가 `123:456`인 노드의 스타일이 뭐지?"라는 질문에 즉시 답할 수 있어야 합니다.

---

## Layer 2: TreeBuilder

### 목적
Figma 구조를 **플랫폼에 독립적인 UI 중간 표현(IR)**으로 변환합니다.

### 핵심 개념

#### 1. Variant 병합 (SuperTree)
Figma의 COMPONENT_SET은 여러 variant를 가집니다 (예: Size=Large/Small, State=Default/Hover).

```
Variant 1: Button [Size=Large, State=Default]
Variant 2: Button [Size=Large, State=Hover]
Variant 3: Button [Size=Small, State=Default]
...
```

이 variant들을 **하나의 통합 트리(SuperTree)**로 병합합니다. 같은 위치에 있는 노드들은 "같은 노드"로 인식하여 묶습니다.

> "위치가 80% 이상 겹치면 같은 노드" (IoU 기반 매칭)

#### 2. 휴리스틱 (Component Detection)
디자인의 시각적 특성과 이름 패턴을 분석하여 **어떤 종류의 컴포넌트인지** 판별합니다.

| 감지 대상 | 판별 기준 |
|----------|----------|
| **Button** | 이름에 "button", State에 "Pressed/Active", 적절한 크기(24~64px), 배경색/테두리 존재 |
| **Input** | 이름에 "input/textfield", 커서 요소, placeholder 텍스트 |
| **Toggle** | 이름에 "toggle/switch", On/Off 상태 |

> 휴리스틱은 **점수 기반**입니다. 여러 조건의 점수를 합산하여 임계점(threshold)을 넘으면 해당 컴포넌트로 판정합니다.

#### 3. Semantic Role 분석
각 노드가 UI에서 **어떤 역할**을 하는지 분석합니다.

- **Icon**: 아이콘 역할 (VECTOR, 작은 INSTANCE)
- **TextInput**: 텍스트 입력 필드
- **Slot**: 외부에서 주입받을 콘텐츠 영역

#### 4. 조건부 렌더링/스타일
variant 간 차이를 분석하여 **조건부 로직**을 생성합니다.

- **숨김 조건**: "이 노드는 `showIcon=false`일 때 숨겨진다"
- **동적 스타일**: "이 노드의 배경색은 `state='hover'`일 때 파란색이다"
- **CSS Pseudo**: "Hover 상태는 `:hover`로, Pressed는 `:active`로 변환"

#### 5. 외부 컴포넌트 참조
버튼 내부의 아이콘처럼 **다른 컴포넌트를 참조**하는 INSTANCE를 감지합니다. 이들은 별도 컴포넌트로 분리되어 import됩니다.

### 처리 단계 (Phase)

| Phase | 하는 일 |
|-------|--------|
| **Phase 1: 구조** | variant들을 하나의 트리로 병합, props 추출 |
| **Phase 2: 분석** | 노드 역할 분석, 숨김 조건 감지 |
| **Heuristics** | 컴포넌트 유형 판별 (Button/Input/Toggle 등) |
| **Phase 3: 변환** | 스타일 빌드, 슬롯 감지, prop 바인딩 |
| **Phase 4: 조립** | 최종 DesignNode 트리 생성 |

---

## Layer 3: CodeEmitter

### 목적
플랫폼 독립적 IR(DesignTree)을 **React/TypeScript 코드**로 변환합니다.

### 하는 일

#### 1. Imports 생성
필요한 라이브러리와 컴포넌트를 import합니다.
- React 관련 (`React`)
- 스타일 라이브러리 (`@emotion/styled` 또는 TailwindCSS)
- 외부 컴포넌트 (`./Icon`, `./Badge` 등)

#### 2. Props Interface 생성
TypeScript 타입 정의를 생성합니다.
```typescript
interface ButtonProps {
  size?: "large" | "small";
  state?: "default" | "hover" | "disabled";
  label?: string;
  icon?: React.ReactNode;
}
```

#### 3. 스타일 코드 생성
두 가지 전략 중 하나를 선택합니다:

| 전략 | 출력 형태 |
|------|----------|
| **Emotion** | `styled.button\`...\`` CSS-in-JS |
| **TailwindCSS** | `className="flex items-center..."` 유틸리티 클래스 |

동적 스타일은 props에 따라 조건부로 적용됩니다.

#### 4. JSX 트리 생성
DesignNode 트리를 JSX로 변환합니다.
- **레이아웃 노드** → `<div>` 또는 styled component
- **텍스트 노드** → `<span>` 또는 prop 바인딩 (`{props.label}`)
- **아이콘 노드** → `<svg>` 또는 컴포넌트 (`<Icon />`)
- **슬롯 노드** → `{props.children}` 또는 `{props.icon}`

---

## 핵심 개념 정리

### 의존성 분석과 토폴로지 정렬
> "참조되는 컴포넌트를 먼저 컴파일해야 import할 수 있다"

복잡한 UI는 여러 컴포넌트로 구성됩니다. Dialog가 Button을, Button이 Icon을 사용한다면, Icon → Button → Dialog 순서로 컴파일해야 합니다. 순환 참조(A가 B를, B가 A를 참조)는 에러로 처리합니다.

### Variant와 SuperTree
> "여러 상태(variant)를 가진 컴포넌트를 하나의 유연한 컴포넌트로 만든다"

Figma에서는 각 상태가 별도 디자인이지만, 코드에서는 props로 상태를 제어하는 단일 컴포넌트가 됩니다.

### 휴리스틱 기반 컴포넌트 감지
> "디자인의 시각적 특성을 분석하여 의미를 추론한다"

이름에 "button"이 없어도, 적절한 크기 + 배경색 + 짧은 텍스트 + 중앙 정렬이면 버튼으로 인식합니다.

### 플랫폼 독립적 IR
> "TreeBuilder의 출력은 React에 종속되지 않는다"

DesignTree는 "이 노드는 버튼이고, hover 시 파란색"이라는 **의미**만 담습니다. 이를 React/Vue/Swift 어느 플랫폼으로든 변환할 수 있습니다.

### 조건부 로직 자동 생성
> "variant 간 차이를 분석하여 조건문을 만든다"

- 어떤 노드가 특정 variant에서만 보이면 → `{showIcon && <Icon />}`
- 스타일이 state마다 다르면 → `:hover { ... }` 또는 `props.state === 'hover' && ...`

---

## 데이터 흐름 요약

```
┌─────────────────────────────────────────────────────────────┐
│                        Figma Plugin                         │
│  사용자가 컴포넌트 선택 → Figma API로 데이터 추출           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   DependencyAnalyzer                        │
│  "이 컴포넌트가 다른 컴포넌트를 사용하는지 확인할게"        │
│                                                             │
│  - 의존성 그래프 구축 (누가 누굴 참조하나?)                 │
│  - 순환 의존성 감지 (A→B→A 같은 순환 에러 방지)             │
│  - 토폴로지 정렬 (의존받는 것부터 컴파일 순서 결정)         │
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │  컴파일 순서대로 각 컴포넌트 처리  │
            │  (Icon → Badge → Button → Dialog) │
            └─────────────────┬─────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DataPreparer                           │
│  "이 데이터 효율적으로 조회할 수 있게 정리해둘게"           │
│                                                             │
│  - 깊은 복사 (원본 보호)                                    │
│  - HashMap 구축 (빠른 조회)                                 │
│  - prop 이름 정규화                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       TreeBuilder                           │
│  "이 디자인이 어떤 UI를 표현하는지 분석할게"                │
│                                                             │
│  Phase 1: variant들을 하나로 병합 (SuperTree)               │
│  Phase 2: 각 노드의 역할 분석 (아이콘? 텍스트? 슬롯?)       │
│  Heuristics: 컴포넌트 유형 판별 (버튼? 인풋? 토글?)         │
│  Phase 3: 스타일/조건부 로직 생성                           │
│  Phase 4: 최종 트리 조립                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       CodeEmitter                           │
│  "분석 결과를 React 코드로 만들어줄게"                      │
│                                                             │
│  - TypeScript interface 생성                                │
│  - Styled components 또는 Tailwind 클래스 생성              │
│  - JSX 트리 생성                                            │
│  - Import 문 정리                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     React Component                         │
│  완성된 TypeScript/React 코드                               │
└─────────────────────────────────────────────────────────────┘
```
