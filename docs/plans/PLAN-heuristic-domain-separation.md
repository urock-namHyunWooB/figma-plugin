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
    ├── IComponentHeuristic.ts    # 수정: stateMapping 추가
    ├── GenericHeuristic.ts       # 신규: 범용 로직 (base class)
    ├── ButtonHeuristic.ts        # 신규: 껍데기
    ├── InputHeuristic.ts         # 수정: GenericHeuristic 상속
    ├── CheckboxHeuristic.ts      # 신규: 껍데기
    ├── RadioHeuristic.ts         # 신규: 껍데기
    ├── ToggleHeuristic.ts        # 신규: 껍데기
    └── LinkHeuristic.ts          # 신규: 껍데기
```

## 상세 설계

### 1. IComponentHeuristic (수정)

stateMapping과 stateToPseudo 인터페이스 추가.

```typescript
// components/IComponentHeuristic.ts
import type { PseudoClass } from "@code-generator/types/customType";
import type { ComponentType } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";

export interface IComponentHeuristic {
  /** 이 휴리스틱이 처리하는 컴포넌트 유형 */
  readonly componentType: ComponentType;

  /** 휴리스틱 이름 (디버깅용) */
  readonly name: string;

  /** State → pseudo-class 매핑 */
  readonly stateMapping: Record<string, PseudoClass | null>;

  /** 이 휴리스틱이 해당 컴포넌트를 처리할 수 있는지 판별 */
  canProcess(ctx: BuildContext): boolean;

  /** 컴포넌트 분석 및 처리 */
  process(ctx: BuildContext): BuildContext;

  /** State 값을 pseudo-class로 변환 */
  stateToPseudo(state: string): PseudoClass | null | undefined;

  /** 컴포넌트별 props 수정 (optional) */
  processProps?(ctx: BuildContext): BuildContext;

  /** 컴포넌트별 slot 생성 (optional) */
  processSlots?(ctx: BuildContext): BuildContext;
}
```

### 2. GenericHeuristic (신규)

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
    hovering: ":hover",

    // Active/Pressed
    active: ":active",
    pressed: ":active",
    pressing: ":active",
    clicked: ":active",

    // Focus
    focus: ":focus",
    focused: ":focus",
    "focus-visible": ":focus-visible",

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
    idle: null,
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

### 3. ButtonHeuristic (신규, 껍데기)

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

### 4. CheckboxHeuristic (신규, 껍데기)

```typescript
// components/CheckboxHeuristic.ts
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const CHECKBOX_NAME_PATTERNS: RegExp[] = [
  /checkbox/i,
  /check.?box/i,
];

export class CheckboxHeuristic extends GenericHeuristic {
  readonly componentType = "checkbox" as const;
  readonly name = "CheckboxHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return CHECKBOX_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // 향후 Checkbox 특수 처리
  // on/off → :checked 매핑 추가 시 stateMapping getter로 오버라이드
}
```

### 5. RadioHeuristic (신규, 껍데기)

```typescript
// components/RadioHeuristic.ts
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const RADIO_NAME_PATTERNS: RegExp[] = [
  /radio/i,
  /radio.?button/i,
  /radio.?group/i,
];

export class RadioHeuristic extends GenericHeuristic {
  readonly componentType = "checkbox" as const;  // HTML radio도 :checked 사용
  readonly name = "RadioHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return RADIO_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }
}
```

### 6. ToggleHeuristic (신규, 껍데기)

```typescript
// components/ToggleHeuristic.ts
import type { PseudoClass } from "@code-generator/types/customType";
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const TOGGLE_NAME_PATTERNS: RegExp[] = [
  /toggle/i,
  /switch/i,
];

export class ToggleHeuristic extends GenericHeuristic {
  readonly componentType = "toggle" as const;
  readonly name = "ToggleHeuristic";

  // Toggle 특수 stateMapping (On/Off 추가)
  get stateMapping(): Record<string, PseudoClass | null> {
    return {
      ...super.stateMapping,
      on: ":checked",
      off: null,
    };
  }

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return TOGGLE_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // 향후 Toggle 특수 처리
  // On/Off → data-state 또는 aria-checked
}
```

### 7. LinkHeuristic (신규, 껍데기)

```typescript
// components/LinkHeuristic.ts
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const LINK_NAME_PATTERNS: RegExp[] = [
  /^link$/i,
  /text.?link/i,
  /anchor/i,
  /hyperlink/i,
];

export class LinkHeuristic extends GenericHeuristic {
  readonly componentType = "custom" as const;  // ComponentType에 "link" 없음
  readonly name = "LinkHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return LINK_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // Link는 visited pseudo-class 활용 가능
  // 기본 stateMapping에 이미 포함됨
}
```

### 8. InputHeuristic (수정)

기존 로직 유지, GenericHeuristic 상속으로 변경.

```typescript
// components/InputHeuristic.ts
import { GenericHeuristic } from "./GenericHeuristic";

export class InputHeuristic extends GenericHeuristic {
  readonly componentType = "input" as const;
  readonly name = "InputHeuristic";

  // 기존 canProcess, process, processSlots 로직 유지
  // INPUT_NAME_PATTERNS, hasCaretPattern 등 기존 코드 그대로

  // 향후 Input 특수 처리
  // Error state → .error class (pseudo가 아닌 className)
}
```

### 9. HeuristicsRunner (수정)

```typescript
// HeuristicsRunner.ts
import type { IComponentHeuristic } from "./components/IComponentHeuristic";
import { GenericHeuristic } from "./components/GenericHeuristic";
import { ButtonHeuristic } from "./components/ButtonHeuristic";
import { InputHeuristic } from "./components/InputHeuristic";
import { CheckboxHeuristic } from "./components/CheckboxHeuristic";
import { RadioHeuristic } from "./components/RadioHeuristic";
import { ToggleHeuristic } from "./components/ToggleHeuristic";
import { LinkHeuristic } from "./components/LinkHeuristic";

export class HeuristicsRunner {
  /**
   * 컴포넌트별 휴리스틱 목록
   *
   * 순서 중요 (우선순위):
   * 1. 구체적인 패턴 먼저 (Input, Checkbox 등)
   * 2. 일반적인 패턴 나중 (Button - 많은 것에 매칭될 수 있음)
   * 3. GenericHeuristic은 항상 마지막 (fallback)
   */
  private static componentHeuristics: IComponentHeuristic[] = [
    new InputHeuristic(),      // input, textfield 등
    new CheckboxHeuristic(),   // checkbox
    new RadioHeuristic(),      // radio
    new ToggleHeuristic(),     // toggle, switch
    new LinkHeuristic(),       // link, anchor
    new ButtonHeuristic(),     // button, btn (일반적이라 나중에)
    new GenericHeuristic(),    // fallback (항상 마지막)
  ];

  /** 현재 활성화된 휴리스틱 캐시 */
  private static activeHeuristic: IComponentHeuristic | null = null;

  /**
   * 현재 context에 맞는 휴리스틱 반환
   */
  static getActiveHeuristic(ctx: BuildContext): IComponentHeuristic {
    if (this.activeHeuristic) {
      return this.activeHeuristic;
    }

    for (const heuristic of this.componentHeuristics) {
      if (heuristic.canProcess(ctx)) {
        this.activeHeuristic = heuristic;
        return heuristic;
      }
    }

    // fallback (GenericHeuristic이 항상 true 반환하므로 여기 도달 안 함)
    return this.componentHeuristics[this.componentHeuristics.length - 1];
  }

  /**
   * 휴리스틱 캐시 초기화 (새 컴파일 시작 시 호출)
   */
  static reset(): void {
    this.activeHeuristic = null;
  }

  // 기존 run, processProps, processSlots 유지
  // run() 시작 시 reset() 호출 추가
}
```

### 10. StyleProcessor 연동 (Phase 2)

```typescript
// StyleProcessor.ts
import { HeuristicsRunner } from "../heuristics";

export class StyleProcessor {
  static build(ctx: BuildContext): BuildContext {
    // 휴리스틱에서 stateToPseudo 함수 가져오기
    const heuristic = HeuristicsRunner.getActiveHeuristic(ctx);

    // classifyStyles 내부에서 사용
    const stateToPseudo = (state: string) => heuristic.stateToPseudo(state);

    // ... 기존 로직에서 stateToPseudo 사용
  }
}
```

### 11. BuildContext 확장 (선택적)

```typescript
// BuildContext.ts
export interface BuildContext {
  // 기존 필드...

  /** 활성화된 휴리스틱 (캐시) */
  activeHeuristic?: IComponentHeuristic;
}
```

## 마이그레이션 단계

### Phase 1: 구조 생성
1. [ ] IComponentHeuristic 수정 (stateMapping, stateToPseudo 추가)
2. [ ] GenericHeuristic 생성 (stateMapping 포함)
3. [ ] ButtonHeuristic 생성 (껍데기)
4. [ ] CheckboxHeuristic 생성 (껍데기)
5. [ ] RadioHeuristic 생성 (껍데기)
6. [ ] ToggleHeuristic 생성 (껍데기)
7. [ ] LinkHeuristic 생성 (껍데기)
8. [ ] InputHeuristic → GenericHeuristic 상속으로 변경
9. [ ] HeuristicsRunner 수정 (휴리스틱 등록, getActiveHeuristic 추가)
10. [ ] index.ts export 업데이트

### Phase 2: StyleProcessor 통합
1. [ ] StyleProcessor에서 HeuristicsRunner.getActiveHeuristic 사용
2. [ ] stateToPseudo 호출을 heuristic.stateToPseudo로 변경
3. [ ] stateUtils.ts deprecated 처리 (호환성 유지)

### Phase 3: 도메인 로직 분리 (필요 시)
1. [ ] 각 휴리스틱에 컴포넌트별 특수 로직 추가
2. [ ] Error state → .error class (InputHeuristic)
3. [ ] On/Off → data-state (ToggleHeuristic)
4. [ ] stateUtils.ts 완전 제거

## 휴리스틱 우선순위

canProcess 매칭 순서 (위에서 아래로):

| 순서 | 휴리스틱 | 패턴 | 비고 |
|-----|---------|------|------|
| 1 | InputHeuristic | input, textfield, caret | 구조 기반 감지 포함 |
| 2 | CheckboxHeuristic | checkbox | |
| 3 | RadioHeuristic | radio | |
| 4 | ToggleHeuristic | toggle, switch | |
| 5 | LinkHeuristic | link, anchor | |
| 6 | ButtonHeuristic | button, btn, cta | 범용적이라 후순위 |
| 7 | GenericHeuristic | (항상 true) | fallback |

**예시**: "Input Button" 이름 → InputHeuristic 매칭 (먼저 검사)

## 파일 변경 목록

| 파일 | 작업 |
|-----|------|
| `IComponentHeuristic.ts` | 수정 (인터페이스 확장) |
| `GenericHeuristic.ts` | 신규 생성 |
| `ButtonHeuristic.ts` | 신규 생성 |
| `CheckboxHeuristic.ts` | 신규 생성 |
| `RadioHeuristic.ts` | 신규 생성 |
| `ToggleHeuristic.ts` | 신규 생성 |
| `LinkHeuristic.ts` | 신규 생성 |
| `InputHeuristic.ts` | 수정 (상속) |
| `HeuristicsRunner.ts` | 수정 (등록, getActiveHeuristic) |
| `index.ts` | 수정 (export) |
| `StyleProcessor.ts` | 수정 (Phase 2) |
| `stateUtils.ts` | deprecated (Phase 2) |

## 테스트 계획

### Unit Tests
1. GenericHeuristic.stateToPseudo 테스트
2. 각 휴리스틱의 canProcess 테스트
3. ToggleHeuristic stateMapping 오버라이드 테스트
4. HeuristicsRunner 우선순위 테스트

### Integration Tests
1. Primary.json → ButtonHeuristic 감지 확인
2. InputBoxstandard.json → InputHeuristic 감지 확인
3. 미매칭 컴포넌트 → GenericHeuristic fallback 확인
4. 기존 테스트 전체 통과

## 위험 요소

| 위험 | 대응 |
|-----|------|
| canProcess 중복 매칭 | 우선순위 순서 문서화, 테스트 |
| InputHeuristic 기존 동작 변경 | 상속만 변경, 로직 유지 |
| stateMapping 누락 | GenericHeuristic에 기존 매핑 전체 포함 |
| 순환 참조 | HeuristicsRunner ↔ StyleProcessor 주의 |

## 완료 조건

- [ ] 모든 기존 테스트 통과 (658개)
- [ ] Primary.json 컴파일 → ButtonHeuristic 사용
- [ ] InputBoxstandard.json 컴파일 → InputHeuristic 사용
- [ ] 그 외 컴포넌트 → GenericHeuristic 사용
- [ ] 새 휴리스틱 테스트 추가
