# 컴포넌트 추상 모델과 파이프라인 매핑

> UITree는 플랫폼 독립적인 컴포넌트 IR이다.
> 이 문서는 컴포넌트의 추상 모델 5가지 관점에서 TreeManager가 각각을 어떻게 구성하는지 설명한다.

## 컴포넌트의 5가지 추상 요소

어떤 플랫폼이든 UI 컴포넌트는 다음 5가지로 분해된다:

| # | 요소 | 설명 |
|---|------|------|
| 1 | **Props** | 외부에서 받는 입력 인터페이스 |
| 2 | **State** | 내부 상태 |
| 3 | **Template** | 구조 + 조건부 렌더링 (무엇을 그리는가) |
| 4 | **Style** | 시각 표현 (어떻게 보이는가) |
| 5 | **Behavior** | 이벤트 핸들링 (어떻게 반응하는가) |

UITree에서의 대응:

- Props, State → UITree 최상위 필드 (`props`, `stateVars`, `derivedVars`)
- Template, Style, Behavior → `root` 노드 트리 안에 혼합 (`visibleCondition`, `styles`, `bindings`)

---

## TreeManager 파이프라인

Figma의 여러 variant(독립된 트리들)를 **하나의 트리로 병합**하면서, 그 과정에서 컴포넌트의 5가지 요소를 모두 구성한다. 1번 병합이 2~4번의 재료를 만들고, 5번 휴리스틱이 Figma에 없는 정보(State, Behavior)를 보충하는 구조다.

### 1. 병합

Figma에서 하나의 컴포넌트는 여러 variant로 존재한다. 예를 들어 Button이 `Size=Small`, `Size=Large` 두 variant면, Figma 내부에는 두 개의 독립된 트리가 있다.

```
Size=Small:                 Size=Large:
├── Icon ★                  ├── Icon ★
└── Label "확인"             └── Label "확인"
```

이 두 트리를 하나로 합쳐야 React 컴포넌트 하나를 만들 수 있다.

합칠 때 핵심은 **"Small의 Icon과 Large의 Icon이 같은 노드인가?"**를 판별하는 것이다. 이름이 같다고 항상 같은 노드는 아니고, 이름이 달라도 같은 역할일 수 있다. 그래서 위치, 타입, 크기 등을 종합적으로 비교해서 매칭한다.

매칭이 끝나면 하나의 트리가 되고, 각 노드에는 **"나는 Small에서도 왔고 Large에서도 왔다"** 또는 **"나는 Large에서만 왔다"** 같은 출처가 기록된다. 이 출처 기록이 이후 단계의 모든 연결(조건부 렌더링, 조건부 스타일)의 근거가 된다.

### 2. Props 추출

병합된 트리에서 "이 컴포넌트는 외부에서 뭘 받아야 하는가"를 결정한다.

가장 주요한 소스는 variant 이름이다. `Size=Small/Large`가 있었으면 `size`라는 prop이, `State=Default/Hover`가 있었으면 `state`라는 prop이 만들어진다.

그 외에 Figma가 직접 명시한 속성도 prop이 된다:
- 텍스트 속성 → string prop (예: `label`)
- boolean 속성 → boolean prop (예: `hasIcon`)
- boolean으로 토글되는 인스턴스 → slot prop (예: `leftIcon: ReactNode`)

이 시점에서 prop은 이름과 타입만 정의된 상태다. 어떤 노드에 영향을 미치는지는 아직 명시되지 않았지만, variant 이름에서 나왔기 때문에 다음 단계에서 같은 이름으로 자연스럽게 연결된다.

### 3. Template 구성

1번에서 기록한 출처를 활용해서, 각 노드의 **존재 조건**과 **내용 바인딩**을 결정한다.

**존재 조건**: 모든 variant에 있던 노드는 항상 렌더링된다. 일부 variant에서만 있던 노드는 조건이 붙는다. Spinner가 `State=Loading`에서만 왔으면 → `state === "loading"` 조건이 생긴다.

**내용 바인딩**: Figma가 "이 텍스트는 Label 속성과 연결됨"이라고 명시한 경우, 고정 텍스트 `"확인"` 대신 `{label}` prop 참조가 연결된다. 슬롯도 마찬가지로 해당 노드에 prop 참조가 연결된다.

### 4. Style 구성

역시 1번의 출처 기록을 활용한다. 같은 노드가 variant마다 다른 스타일을 가지고 있으면, 그 차이를 분류한다.

- **모든 variant에서 같은 값** → 공통 스타일. 예: `display: flex`는 Size가 뭐든 동일
- **variant에 따라 다른 값** → 조건부 스타일. 예: `Size=Large`일 때만 `padding: 12px`
- **State variant 중 hover, active, disabled** → CSS pseudo-class로 변환. prop 대신 CSS가 처리

prop이 여러 개일 때(예: Size × State = 4개 variant), 특정 스타일 차이가 어느 prop 때문인지 역추론하는 **스타일 분해**는 후처리 단계에서 수행한다. 트리 구성 시점에서는 개별 컴포넌트 하나만 보고 있지만, 스타일 분해는 메인 컴포넌트와 의존성 컴포넌트들의 관계까지 알아야 정확하기 때문이다.

### 5. 의미 부여

여기까지는 Figma 데이터에서 기계적으로 추출한 정보만 처리한 것이다. 하지만 Figma에는 "이건 Button이다", "클릭하면 이벤트가 발생한다", "내부에 열림/닫힘 상태가 있다" 같은 정보가 없다.

휴리스틱이 이름, prop 구조, 자식 구성을 분석해서:
- **컴포넌트 종류 판별** — "이건 Button이다", "이건 Dropdown이다"
- **State 생성** — Dropdown이면 `isOpen`, SegmentedControl이면 `selected`
- **Behavior 생성** — Input이면 `onChange`, Dropdown이면 클릭 시 토글
- **Props 조정** — 불필요한 prop 제거, 필요한 prop 추가

1~4번이 Figma 데이터 기반의 **기계적 변환**이라면, 5번은 **추론 기반의 의미 부여**다.

### 결과: UITree → SemanticComponent

1~5번이 끝나면 UITree가 완성된다. UITree는 Figma 의미를 완전히 보존한 트리지만 일부 React 종속이 남아 있다 (`bindings.attrs`에 일반 속성과 이벤트가 섞임, `stateVars.setter` 같은 React 명명 등).

**Layer 2.5 (`SemanticIRBuilder`)** 가 이 UITree를 framework-agnostic한 `SemanticComponent`로 정규화한다 — 7구역(`props` / `state` / `derived` / `structure` / `attrs` / `events` / `styles`)으로 평탄화하고, `node.type` → `node.kind` 등 IR boundary를 표시한다.

이후 `CodeEmitter`가 이 IR을 받아서 특정 프레임워크(React)와 스타일 전략(Emotion/Tailwind)에 맞게 코드로 출력한다. 같은 IR을 다른 emitter(Vue, Svelte, SwiftUI, Compose)가 자기 방식으로 풀기만 하면 새 framework도 지원할 수 있는 구조다. 자세한 내용은 [code-emitter 문서](../3-code-generation/emitter.md) 참조.

---

## Props와 노드의 연결

### 연결의 핵심 원리: 병합이 곧 연결

prop 정의와 노드의 연결은 별도의 매칭 단계가 아니라, **여러 variant를 하나의 트리로 병합하는 과정 자체에서 만들어진다.**

variant 이름이 `Size=Large, State=Loading`이면:
- 이 이름에서 `size`, `state`라는 prop이 추출되고
- 이 variant에 속한 노드의 조건에도 같은 `size`, `state`가 들어간다

같은 출처(variant 이름)에서 파생되기 때문에 이름이 자연스럽게 일치하고, 이름이 곧 연결 고리가 된다. prop 정의에는 "어떤 노드에 연결된다"는 정보가 없고, 노드 쪽에서 prop 이름을 참조하는 단방향 구조다.

### 연결이 표현되는 세 가지 방식

같은 prop이라도 노드에 따라 연결 방식이 다르며, 하나의 prop이 여러 노드에 동시에 다른 방식으로 연결될 수 있다.

#### Template에서의 연결 (구조적 연결)

- **텍스트 연결** — Figma에서 "이 텍스트는 이 속성과 연결됨"이라고 명시한 경우, 고정 텍스트 대신 prop 값이 들어간다. `"확인"` → `{label}`.
- **슬롯 연결** — boolean prop으로 보이고/숨겨지는 인스턴스가 있으면, 그 노드 자체가 외부에서 주입받는 슬롯이 된다. prop이 노드의 **존재 자체**를 결정하는 관계.
- **조건부 렌더링** — 특정 variant에서만 존재하는 노드에 "이 prop이 이 값일 때만 보인다"라는 조건을 붙인다.

#### Style에서의 연결 (시각적 연결)

- **조건부 스타일** — variant별로 다른 스타일 값을 비교해서 "이 속성은 이 prop 때문에 바뀐다"를 찾아낸다. 예를 들어 Size가 Large일 때 padding이 커지면, padding은 size prop에 연결된다.
- **Pseudo-class** — State variant 중 hover, active, disabled 같은 값은 prop이 아니라 CSS pseudo-class로 변환한다. prop을 제거하고 CSS로 대체하는 케이스.

---

## 조건부 렌더링의 원리

Figma에서 variant마다 독립된 트리를 갖고 있다는 점이 핵심이다.

예를 들어 Button에 `State=Default`, `State=Loading` 두 variant가 있고, Loading에만 Spinner가 존재한다면:

```
State=Default:              State=Loading:
├── Label "확인"             ├── Label "확인"
                            └── Spinner ⬡
```

병합하면 하나의 트리가 된다:

```
병합된 트리:
├── Label "확인"     ← Default ✓, Loading ✓
└── Spinner ⬡       ← Default ✗, Loading ✓
```

각 노드가 **어느 variant에서 왔는지** 기록이 남아 있으므로:
- Label → 모든 variant에 존재 → 조건 없음 (항상 렌더링)
- Spinner → Loading에서만 존재 → `state === "loading"` 조건 자동 생성

**variant 간 노드 존재 여부의 차이**가 곧 조건부 렌더링이 된다.
