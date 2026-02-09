# PLAN: 휴리스틱 도메인 분리

## 개요

컴포넌트 유형별 휴리스틱 구조를 도입하여 도메인별 로직 분리 및 확장성 확보.

## 현재 구조

```
heuristics/
├── IHeuristic.ts
├── HeuristicsRunner.ts
└── components/
    ├── IComponentHeuristic.ts
    └── InputHeuristic.ts      # 독립 구현
```

**문제점**:
- State → pseudo-class 매핑이 전역 유틸리티 (stateUtils.ts)
- 컴포넌트별 특수 로직 추가 시 구조적 기반 부족
- InputHeuristic만 존재, 다른 컴포넌트 휴리스틱 없음

## 목표 구조

```
heuristics/
├── IHeuristic.ts
├── HeuristicsRunner.ts
└── components/
    ├── IComponentHeuristic.ts
    ├── GenericHeuristic.ts       # 신규: 범용 로직 (base class)
    ├── ButtonHeuristic.ts        # 신규: 껍데기
    ├── InputHeuristic.ts         # 수정: GenericHeuristic 상속
    ├── CheckboxHeuristic.ts      # 신규: 껍데기
    ├── ToggleHeuristic.ts        # 신규: 껍데기
    └── LinkHeuristic.ts          # 신규: 껍데기
```

## 상세 설계

### 1. GenericHeuristic (신규)

범용 로직을 담는 base class. 모든 특정 휴리스틱이 상속.

```typescript
// components/GenericHeuristic.ts
import type { PseudoClass } from "@code-generator/types/customType";
import type { ComponentType } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";
import type { IComponentHeuristic } from "./IComponentHeuristic";

export class GenericHeuristic implements IComponentHeuristic {
  readonly componentType: ComponentType = "unknown";
  readonly name = "GenericHeuristic";

  /**
   * 범용 State → pseudo-class 매핑
   * stateUtils.ts의 STATE_TO_PSEUDO에서 이동
   */
  readonly stateMapping: Record<string, PseudoClass | null> = {
    // Hover
    hover: ":hover",
    hovered: ":hover",

    // Active/Pressed
    active: ":active",
    pressed: ":active",

    // Focus
    focus: ":focus",
    focused: ":focus",

    // Disabled
    disabled: ":disabled",
    inactive: ":disabled",

    // Checked/Selected
    checked: ":checked",
    selected: ":checked",

    // Visited
    visited: ":visited",

    // Default (no pseudo-class)
    default: null,
    normal: null,
    enabled: null,
    rest: null,
  };

  /**
   * Fallback - 항상 true
   */
  canProcess(_ctx: BuildContext): boolean {
    return true;
  }

  /**
   * 기본 처리 - 변경 없음
   */
  process(ctx: BuildContext): BuildContext {
    return ctx;
  }

  /**
   * State 값을 pseudo-class로 변환
   * 하위 클래스에서 오버라이드 가능
   */
  stateToPseudo(state: string): PseudoClass | null | undefined {
    const normalized = state.toLowerCase();
    if (normalized in this.stateMapping) {
      return this.stateMapping[normalized];
    }
    return undefined;
  }
}
```

### 2. ButtonHeuristic (신규, 껍데기)

```typescript
// components/ButtonHeuristic.ts
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const BUTTON_NAME_PATTERNS: RegExp[] = [
  /button/i,
  /btn/i,
  /cta/i,  // Call To Action
];

export class ButtonHeuristic extends GenericHeuristic {
  readonly componentType = "button" as const;
  readonly name = "ButtonHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return BUTTON_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // 나머지는 GenericHeuristic 상속
  // 향후 버튼 특수 로직 추가 시 여기에 override
}
```

### 3. CheckboxHeuristic (신규, 껍데기)

```typescript
// components/CheckboxHeuristic.ts
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const CHECKBOX_NAME_PATTERNS: RegExp[] = [
  /checkbox/i,
  /check.?box/i,
  /radio/i,
  /radio.?button/i,
];

export class CheckboxHeuristic extends GenericHeuristic {
  readonly componentType = "checkbox" as const;
  readonly name = "CheckboxHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return CHECKBOX_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // Checkbox 특수 stateMapping (필요 시)
  // readonly stateMapping = {
  //   ...super.stateMapping,
  //   on: ":checked",
  //   off: null,
  // };
}
```

### 4. ToggleHeuristic (신규, 껍데기)

```typescript
// components/ToggleHeuristic.ts
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const TOGGLE_NAME_PATTERNS: RegExp[] = [
  /toggle/i,
  /switch/i,
];

export class ToggleHeuristic extends GenericHeuristic {
  readonly componentType = "toggle" as const;
  readonly name = "ToggleHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return TOGGLE_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // Toggle 특수 처리 (향후)
  // On/Off → data-state 또는 aria-checked
}
```

### 5. LinkHeuristic (신규, 껍데기)

```typescript
// components/LinkHeuristic.ts
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const LINK_NAME_PATTERNS: RegExp[] = [
  /^link$/i,
  /text.?link/i,
  /anchor/i,
];

export class LinkHeuristic extends GenericHeuristic {
  readonly componentType = "button" as const; // HTML에서는 <a> 또는 <button>
  readonly name = "LinkHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return LINK_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }
}
```

### 6. InputHeuristic (수정)

기존 로직 유지, GenericHeuristic 상속으로 변경.

```typescript
// 변경 전
export class InputHeuristic implements IComponentHeuristic { ... }

// 변경 후
import { GenericHeuristic } from "./GenericHeuristic";

export class InputHeuristic extends GenericHeuristic {
  readonly componentType = "input" as const;
  readonly name = "InputHeuristic";

  // 기존 canProcess, process, processSlots 유지
  // ...
}
```

### 7. HeuristicsRunner (수정)

```typescript
// HeuristicsRunner.ts
import { GenericHeuristic } from "./components/GenericHeuristic";
import { ButtonHeuristic } from "./components/ButtonHeuristic";
import { InputHeuristic } from "./components/InputHeuristic";
import { CheckboxHeuristic } from "./components/CheckboxHeuristic";
import { ToggleHeuristic } from "./components/ToggleHeuristic";
import { LinkHeuristic } from "./components/LinkHeuristic";

export class HeuristicsRunner {
  /**
   * 컴포넌트별 휴리스틱 목록
   * 순서 중요: 구체적인 것 먼저, GenericHeuristic은 마지막 (fallback)
   */
  private static componentHeuristics: IComponentHeuristic[] = [
    new ButtonHeuristic(),
    new InputHeuristic(),
    new CheckboxHeuristic(),
    new ToggleHeuristic(),
    new LinkHeuristic(),
    new GenericHeuristic(),  // fallback (항상 마지막)
  ];

  // 기존 run, processProps, processSlots 유지
}
```

### 8. StyleProcessor 연동 (향후)

```typescript
// StyleProcessor.ts
// stateToPseudo를 휴리스틱에서 가져오도록 변경

static build(ctx: BuildContext): BuildContext {
  // 휴리스틱에서 stateToPseudo 함수 가져오기
  const heuristic = HeuristicsRunner.getActiveHeuristic(ctx);
  const stateToPseudo = (state: string) => heuristic.stateToPseudo(state);

  // ... 기존 로직에서 stateToPseudo 사용
}
```

## 마이그레이션 단계

### Phase 1: 구조 생성 (현재)
1. [ ] GenericHeuristic 생성 (stateMapping 포함)
2. [ ] ButtonHeuristic 생성 (껍데기)
3. [ ] CheckboxHeuristic 생성 (껍데기)
4. [ ] ToggleHeuristic 생성 (껍데기)
5. [ ] LinkHeuristic 생성 (껍데기)
6. [ ] InputHeuristic → GenericHeuristic 상속으로 변경
7. [ ] HeuristicsRunner 수정 (휴리스틱 등록)
8. [ ] index.ts export 업데이트

### Phase 2: 통합 (향후)
1. [ ] StyleProcessor에서 heuristic.stateToPseudo 사용
2. [ ] stateUtils.ts 제거 또는 deprecated
3. [ ] 테스트 업데이트

### Phase 3: 도메인 로직 분리 (필요 시)
1. [ ] 각 휴리스틱에 컴포넌트별 특수 로직 추가
2. [ ] Error state → .error class (InputHeuristic)
3. [ ] On/Off → data-state (ToggleHeuristic)

## 파일 변경 목록

| 파일 | 작업 |
|-----|------|
| `GenericHeuristic.ts` | 신규 생성 |
| `ButtonHeuristic.ts` | 신규 생성 |
| `CheckboxHeuristic.ts` | 신규 생성 |
| `ToggleHeuristic.ts` | 신규 생성 |
| `LinkHeuristic.ts` | 신규 생성 |
| `InputHeuristic.ts` | 수정 (상속) |
| `HeuristicsRunner.ts` | 수정 (등록) |
| `index.ts` | 수정 (export) |

## 테스트 계획

1. 기존 테스트 통과 확인
2. 각 휴리스틱의 canProcess 테스트
3. GenericHeuristic fallback 동작 테스트
4. Primary.json (Button) → ButtonHeuristic 감지 확인
5. InputBoxstandard.json → InputHeuristic 감지 확인

## 위험 요소

| 위험 | 대응 |
|-----|------|
| canProcess 중복 매칭 | 휴리스틱 순서로 우선순위 결정 |
| InputHeuristic 기존 동작 변경 | 상속만 변경, 로직 유지 |
| stateMapping 누락 | GenericHeuristic에 기존 매핑 전체 포함 |

## 완료 조건

- [ ] 모든 기존 테스트 통과
- [ ] Primary.json 컴파일 → ButtonHeuristic 사용
- [ ] InputBoxstandard.json 컴파일 → InputHeuristic 사용
- [ ] 그 외 컴포넌트 → GenericHeuristic 사용
