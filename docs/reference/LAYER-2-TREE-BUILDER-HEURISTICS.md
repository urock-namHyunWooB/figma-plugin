# TreeBuilder Heuristics

> **핵심**: 컴포넌트 패턴을 감지하여 적절한 시맨틱 타입을 부여합니다.

## 요약

| 입력 | 출력 | 역할 |
|-----|------|------|
| BuildContext | componentType, nodeSemanticTypes | 패턴 기반 타입 결정 |

---

## 왜 필요한가?

일반적인 분석만으로는 **컴포넌트의 의도**를 알 수 없습니다:

```
Frame + Text + Icon = ???
  - Button일 수도 있고
  - Chip일 수도 있고
  - ListItem일 수도 있음
```

Heuristics는 **패턴 매칭**으로 컴포넌트 종류를 추론합니다.

---

## 아키텍처

```
BuildContext
     │
     ▼
┌─────────────────────────────────────┐
│        HeuristicsRunner             │
├─────────────────────────────────────┤
│  for each heuristic:                │
│    if heuristic.canProcess(ctx):    │
│      ctx = heuristic.process(ctx)   │
│      break                          │
└─────────────────────────────────────┘
     │
     ▼
BuildContext (with componentType, nodeSemanticTypes)
```

### IHeuristic 인터페이스

```typescript
interface IHeuristic {
  readonly name: string;

  // 이 휴리스틱이 처리 가능한지 판단
  canProcess(ctx: BuildContext): boolean;

  // 처리 수행 (canProcess가 true일 때만 호출됨)
  process(ctx: BuildContext): BuildContext;
}
```

---

## 구현된 Heuristics

### InputHeuristic

**감지 조건** (`canProcess`)

```typescript
function canProcess(ctx: BuildContext): boolean {
  // 1. props에 "value" 또는 "placeholder"가 있는가?
  // 2. TEXT 노드가 있는가?
  // 3. 이름에 "input", "text field" 등이 포함되어 있는가?
}
```

**처리 내용** (`process`)

1. `componentType: "input"` 설정
2. TEXT 노드에 `semanticType: "input-value"` 부여
3. Placeholder TEXT에 `semanticType: "input-placeholder"` 부여

**결과**

```typescript
{
  componentType: "input",
  nodeSemanticTypes: Map {
    "text-node-1" => { type: "input-value", binding: "value" },
    "text-node-2" => { type: "input-placeholder", binding: "placeholder" }
  }
}
```

---

## 확장 방법

새 Heuristic 추가:

```typescript
// heuristics/components/ButtonHeuristic.ts
export class ButtonHeuristic implements IHeuristic {
  readonly name = "ButtonHeuristic";

  canProcess(ctx: BuildContext): boolean {
    // Button 패턴 감지 로직
    const hasClickableAppearance = ...;
    const hasLabelText = ...;
    return hasClickableAppearance && hasLabelText;
  }

  process(ctx: BuildContext): BuildContext {
    return {
      ...ctx,
      componentType: "button",
      nodeSemanticTypes: new Map([
        [labelNodeId, { type: "button-label" }]
      ])
    };
  }
}
```

HeuristicsRunner에 등록:

```typescript
// heuristics/HeuristicsRunner.ts
private heuristics: IHeuristic[] = [
  new InputHeuristic(),
  new ButtonHeuristic(),  // 추가
  // 우선순위 순서대로 나열
];
```

---

## 다음 단계

**Phase 3**에서 노드별 세부 변환을 수행합니다.

---

## 관련 파일

```
heuristics/
├── HeuristicsRunner.ts
└── components/
    └── InputHeuristic.ts
```
