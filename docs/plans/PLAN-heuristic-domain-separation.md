# PLAN: 휴리스틱 중심 아키텍처 전환

## 개요

현재 Processor 중심 구조에서 **Heuristic 중심 구조**로 전환.
모든 분석/변환 로직을 휴리스틱에 위임하여 컴포넌트 유형별 처리를 일원화.

## 현재 구조의 문제점
- 로직이 10개+ Processor에 분산
- 컴포넌트별 특수 처리 어려움
- stateToPseudo 등 전역 함수 의존
- 휴리스틱이 일부 단계만 개입

## 목표 구조 (Heuristic 중심)

```
TreeBuilder.build()
│
├── [COMPONENT_SET] → HeuristicsRunner.run(ctx)  ← 전부 위임
│   │
│   ├── HeuristicsRunner.getActiveHeuristic(ctx)
│   │
│   └── ActiveHeuristic.process(ctx)
│       ├── processStructure()      # Phase 1: 구조 생성
│       ├── processAnalysis()       # Phase 2: 분석
│       ├── processTransform()      # Phase 3: 노드 변환
│       └── processBuild()          # Phase 4: 최종 조립
│
└── [Other: COMPONENT, FRAME, INSTANCE] → 기본 처리 (processorUtils 직접 사용)
```

### 휴리스틱 계층 구조

```
IComponentHeuristic (interface)
│
└── GenericHeuristic (base class)
    │   - 현재 모든 Processor 로직 포함
    │   - 범용 stateMapping
    │
    ├── ButtonHeuristic
    │   - canProcess: button, btn, cta
    │   - override: processStyles (State → pseudo)
    │
    ├── InputHeuristic
    │   - canProcess: input, textfield, caret
    │   - override: processAnalysis (placeholder)
    │   - override: processSlots (leftIcon, rightIcon)
    │
    ├── CheckboxHeuristic
    │   - canProcess: checkbox
    │   - override: stateMapping (checked)
    │
    ├── RadioHeuristic
    │   - canProcess: radio
    │
    ├── ToggleHeuristic
    │   - canProcess: toggle, switch
    │   - override: stateMapping (on/off)
    │
    └── LinkHeuristic
        - canProcess: link, anchor
        - override: stateMapping (visited)
```

## 상세 설계

### 1. IComponentHeuristic (확장)

```typescript
// components/IComponentHeuristic.ts
import type { PseudoClass } from "@code-generator/types/customType";
import type { ComponentType } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";

export interface IComponentHeuristic {
  /** 컴포넌트 유형 */
  readonly componentType: ComponentType;

  /** 휴리스틱 이름 */
  readonly name: string;

  /** State → pseudo-class 매핑 */
  readonly stateMapping: Record<string, PseudoClass | null>;

  /** 컴포넌트 판별 */
  canProcess(ctx: BuildContext): boolean;

  /** State → pseudo-class 변환 */
  stateToPseudo(state: string): PseudoClass | null | undefined;

  // =========================================================================
  // 파이프라인 메서드 (전체 위임)
  // =========================================================================

  /** 전체 처리 (메인 엔트리포인트) */
  process(ctx: BuildContext): BuildContext;

  /** Phase 1: 구조 생성 */
  processStructure(ctx: BuildContext): BuildContext;

  /** Phase 2: 분석 */
  processAnalysis(ctx: BuildContext): BuildContext;

  /** Phase 3: 노드 변환 */
  processTransform(ctx: BuildContext): BuildContext;

  /** Phase 4: 최종 조립 */
  processBuild(ctx: BuildContext): BuildContext;

  // =========================================================================
  // 세부 처리 메서드 (override 가능)
  // =========================================================================

  // Phase 1: 구조 생성
  /** 구조: Variant 병합 */
  processVariants(ctx: BuildContext): BuildContext;
  /** 구조: Instance 내부 노드 정리 */
  processInstanceCleanup(ctx: BuildContext): BuildContext;
  /** 구조: Props 추출 */
  processPropsExtract(ctx: BuildContext): BuildContext;

  // Phase 3: 노드 변환
  /** 변환: Node type 매핑 */
  processNodeTypes(ctx: BuildContext): BuildContext;
  /** 변환: Style 분류 (base/dynamic/pseudo) */
  processStyles(ctx: BuildContext): BuildContext;
  /** 변환: Position 스타일 */
  processPositions(ctx: BuildContext): BuildContext;
  /** 변환: Rotation 처리 */
  processRotation(ctx: BuildContext): BuildContext;
  /** 변환: External refs 생성 */
  processExternalRefs(ctx: BuildContext): BuildContext;
  /** 변환: Visibility 조건 */
  processVisibility(ctx: BuildContext): BuildContext;
  /** 변환: Props 바인딩 */
  processProps(ctx: BuildContext): BuildContext;
  /** 변환: Slot 감지 */
  processSlots(ctx: BuildContext): BuildContext;

  // Phase 4: 최종 조립
  /** 조립: DesignNode 트리 생성 */
  buildDesignTree(ctx: BuildContext): BuildContext;
  /** 조립: 정리 (hidden 노드 제거 등) */
  processCleanup(ctx: BuildContext): BuildContext;
}
```

### 2. GenericHeuristic (Base Class)

```typescript
// components/GenericHeuristic.ts
import type { PseudoClass } from "@code-generator/types/customType";
import type { ComponentType } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";
import type { IComponentHeuristic } from "./IComponentHeuristic";

// 현재 Processor들의 로직을 유틸리티로 import
import {
  // Phase 1: 구조 생성
  mergeVariants,
  removeInstanceInternalNodes,
  extractProps,
  // Phase 2: 분석
  detectSemanticRoles,
  processHidden,
  // Phase 3: 노드 변환
  mapNodeTypes,
  buildStyles,
  applyPositions,
  handleRotation,
  buildExternalRefs,
  resolveVisibility,
  bindProps,
  detectSlots,
  detectTextSlots,
  detectArraySlots,
  enrichArraySlotsWithComponentNames,
  // Phase 4: 최종 조립
  buildDesignTree,
  cleanupNodes,
} from "../utils/processorUtils";

export class GenericHeuristic implements IComponentHeuristic {
  readonly componentType: ComponentType = "unknown";
  readonly name = "GenericHeuristic";

  // =========================================================================
  // State Mapping
  // =========================================================================

  protected readonly baseStateMapping: Record<string, PseudoClass | null> = {
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

  get stateMapping(): Record<string, PseudoClass | null> {
    return this.baseStateMapping;
  }

  stateToPseudo(state: string): PseudoClass | null | undefined {
    const normalized = state.toLowerCase();
    const mapping = this.stateMapping;
    if (normalized in mapping) {
      return mapping[normalized];
    }
    return undefined;
  }

  // =========================================================================
  // 컴포넌트 판별
  // =========================================================================

  canProcess(_ctx: BuildContext): boolean {
    return true; // Fallback - 항상 처리
  }

  // =========================================================================
  // 메인 파이프라인
  // =========================================================================

  process(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = this.processStructure(result);
    result = this.processAnalysis(result);
    result = this.processTransform(result);
    result = this.processBuild(result);
    return result;
  }

  // =========================================================================
  // Phase 1: 구조 생성
  // =========================================================================

  processStructure(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = this.processVariants(result);
    result = this.processInstanceCleanup(result);
    result = this.processPropsExtract(result);
    return result;
  }

  processVariants(ctx: BuildContext): BuildContext {
    return mergeVariants(ctx);
  }

  processInstanceCleanup(ctx: BuildContext): BuildContext {
    return removeInstanceInternalNodes(ctx);
  }

  processPropsExtract(ctx: BuildContext): BuildContext {
    return extractProps(ctx);
  }

  // =========================================================================
  // Phase 2: 분석
  // =========================================================================

  processAnalysis(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = detectSemanticRoles(result);
    result = processHidden(result);
    // 서브클래스에서 추가 분석 (예: InputHeuristic의 placeholder 감지)
    return result;
  }

  // =========================================================================
  // Phase 3: 노드 변환
  // =========================================================================

  processTransform(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = this.processNodeTypes(result);
    result = this.processStyles(result);
    result = this.processPositions(result);
    result = this.processRotation(result);
    result = this.processExternalRefs(result);
    result = this.processVisibility(result);
    result = this.processProps(result);
    result = this.processSlots(result);
    return result;
  }

  processNodeTypes(ctx: BuildContext): BuildContext {
    return mapNodeTypes(ctx);
  }

  processStyles(ctx: BuildContext): BuildContext {
    // stateToPseudo를 this.stateToPseudo로 전달
    return buildStyles(ctx, (state) => this.stateToPseudo(state));
  }

  processPositions(ctx: BuildContext): BuildContext {
    return applyPositions(ctx);
  }

  processRotation(ctx: BuildContext): BuildContext {
    return handleRotation(ctx);
  }

  processExternalRefs(ctx: BuildContext): BuildContext {
    return buildExternalRefs(ctx);
  }

  processVisibility(ctx: BuildContext): BuildContext {
    return resolveVisibility(ctx, (state) => this.stateToPseudo(state));
  }

  processProps(ctx: BuildContext): BuildContext {
    return bindProps(ctx);
  }

  processSlots(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = detectTextSlots(result);
    result = detectSlots(result);
    result = detectArraySlots(result);
    result = enrichArraySlotsWithComponentNames(result);
    return result;
  }

  // =========================================================================
  // Phase 4: 최종 조립
  // =========================================================================

  processBuild(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = this.buildDesignTree(result);
    result = this.processCleanup(result);
    return result;
  }

  buildDesignTree(ctx: BuildContext): BuildContext {
    return buildDesignTree(ctx);
  }

  processCleanup(ctx: BuildContext): BuildContext {
    return cleanupNodes(ctx);
  }
}
```

### 3. ButtonHeuristic

```typescript
// components/ButtonHeuristic.ts
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const BUTTON_NAME_PATTERNS: RegExp[] = [
  /button/i,
  /btn/i,
  /cta/i,
];

export class ButtonHeuristic extends GenericHeuristic {
  readonly componentType = "button" as const;
  readonly name = "ButtonHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return BUTTON_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // 버튼은 GenericHeuristic의 stateMapping 그대로 사용
  // Hover, Pressed, Disabled → :hover, :active, :disabled

  // 향후 버튼 특수 처리 추가 시 여기서 override
  // processStyles(ctx: BuildContext): BuildContext { ... }
}
```

### 4. InputHeuristic (수정)

```typescript
// components/InputHeuristic.ts
import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const INPUT_NAME_PATTERNS: RegExp[] = [
  /input/i,
  /textfield/i,
  /text.?field/i,
  /search.?bar/i,
];

export class InputHeuristic extends GenericHeuristic {
  readonly componentType = "input" as const;
  readonly name = "InputHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;

    // 이름 패턴 매칭
    if (INPUT_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
      return true;
    }

    // Caret 패턴 감지 (기존 로직)
    if (this.hasCaretPattern(ctx)) {
      return true;
    }

    return false;
  }

  private hasCaretPattern(ctx: BuildContext): boolean {
    // 기존 InputHeuristic의 hasCaretPattern 로직
    // ...
  }

  // Override: 분석 단계에서 placeholder 감지
  processAnalysis(ctx: BuildContext): BuildContext {
    // 부모 분석 먼저 실행
    let result = super.processAnalysis(ctx);

    // Input 특화 분석 추가
    // placeholder 텍스트 감지
    // nodeSemanticTypes, excludePropsFromStyles 설정
    // 기존 InputHeuristic의 process 로직
    return result;
  }

  // Override: Slot 감지에서 Input 특화 slot 추가
  processSlots(ctx: BuildContext): BuildContext {
    // 기본 slot 감지 먼저
    let result = super.processSlots(ctx);

    // Input 특화 slot 추가 (leftIcon, rightIcon, clearButton)
    // 기존 InputHeuristic의 processSlots 로직
    return result;
  }
}
```

### 5. CheckboxHeuristic

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
  // processStyles에서 checked state 특수 처리 등
}
```

### 6. RadioHeuristic

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
  readonly componentType = "radio" as const;
  readonly name = "RadioHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return RADIO_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }
}
```

### 7. ToggleHeuristic

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

  // stateMapping 확장 (On/Off 추가)
  get stateMapping(): Record<string, PseudoClass | null> {
    return {
      ...this.baseStateMapping,
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

### 8. LinkHeuristic

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
  readonly componentType = "link" as const;
  readonly name = "LinkHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return LINK_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // Link는 :visited pseudo-class 활용
  // 기본 stateMapping에 이미 포함됨
}
```

### 9. HeuristicsRunner (간소화)

```typescript
// HeuristicsRunner.ts
import type { BuildContext } from "../workers/BuildContext";
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
   * 휴리스틱 목록 (우선순위 순)
   */
  private static readonly heuristics: IComponentHeuristic[] = [
    new InputHeuristic(),
    new CheckboxHeuristic(),
    new RadioHeuristic(),
    new ToggleHeuristic(),
    new LinkHeuristic(),
    new ButtonHeuristic(),
    new GenericHeuristic(),  // fallback
  ];

  /**
   * 컴포넌트에 맞는 휴리스틱 찾기
   */
  static getHeuristic(ctx: BuildContext): IComponentHeuristic {
    for (const heuristic of this.heuristics) {
      if (heuristic.canProcess(ctx)) {
        return heuristic;
      }
    }
    // GenericHeuristic이 항상 true 반환하므로 여기 도달 안 함
    return this.heuristics[this.heuristics.length - 1];
  }

  /**
   * 전체 파이프라인 실행
   */
  static run(ctx: BuildContext): BuildContext {
    const heuristic = this.getHeuristic(ctx);
    return heuristic.process({
      ...ctx,
      componentType: heuristic.componentType,
    });
  }
}
```

### 10. TreeBuilder (간소화)

```typescript
// TreeBuilder.ts
import type { BuildContext } from "./workers/BuildContext";
import { HeuristicsRunner } from "./heuristics";
import {
  mergeVariants,
  mapNodeTypes,
  buildStyles,
  applyPositions,
  buildDesignTree,
} from "./heuristics/utils/processorUtils";

class TreeBuilder implements ITreeBuilder {
  build(data: PreparedDesignData, policy?: TreeBuilderPolicy): DesignTree {
    let ctx = this.createBuildContext(data, policy);

    // ─────────────────────────────────────────────────────────────────
    // 파이프라인 분기
    // ─────────────────────────────────────────────────────────────────
    if (data.document.type === "COMPONENT_SET") {
      // ─── COMPONENT_SET: 휴리스틱에 전부 위임 ───
      ctx = HeuristicsRunner.run(ctx);
    } else {
      // ─── Non-COMPONENT_SET: processorUtils 직접 사용 ───
      // (Processor 클래스 삭제 후에도 동작)
      ctx = mergeVariants(ctx);
      ctx = mapNodeTypes(ctx);
      ctx = buildStyles(ctx, () => undefined); // pseudo-class 없음
      ctx = applyPositions(ctx);
      ctx = buildDesignTree(ctx);
    }

    // 결과 반환
    return {
      root: ctx.root!,
      componentType: ctx.componentType,
      props: Array.from(ctx.propsMap?.values() || []),
      conditionals: ctx.conditionals,
      slots: ctx.slots,
      arraySlots: ctx.arraySlots,
    };
  }
}
```

### 11. Processor → Utility 변환

#### 11-1. Processor 간 의존성 (순환 참조 주의)

현재 Processor 간 cross-dependency가 존재:

| Processor | 호출하는 함수 | 출처 |
|-----------|-------------|------|
| StyleProcessor | `parseVariantConditionExcluding()` | VisibilityProcessor |
| InstanceProcessor | `isComponentReference()` | NodeProcessor |
| SlotProcessor | `isComponentReference()` | NodeProcessor |

**순환 참조 방지**: 공통 유틸리티를 먼저 추출한 후, 메인 함수에서 사용.

#### 11-2. processorUtils.ts 구조

```typescript
// utils/processorUtils.ts

// ═══════════════════════════════════════════════════════════════════════════
// 1. 공통 유틸리티 (먼저 정의 - 다른 함수들이 의존)
// ═══════════════════════════════════════════════════════════════════════════

// VisibilityProcessor에서 추출
export function parseVariantConditionExcluding(
  variantName: string,
  excludeProps: Set<string>
): ConditionNode | null {
  // 기존 VisibilityProcessor.parseVariantConditionExcluding() 로직
}

// NodeProcessor에서 추출
export function isComponentReference(nodeType: string): boolean {
  // 기존 NodeProcessor.isComponentReference() 로직
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. 메인 Processor 함수 (위 유틸리티 사용)
// ═══════════════════════════════════════════════════════════════════════════

// VariantProcessor → mergeVariants
export function mergeVariants(ctx: BuildContext): BuildContext {
  // 기존 VariantProcessor.merge() 로직
}

// NodeProcessor → mapNodeTypes
export function mapNodeTypes(ctx: BuildContext): BuildContext {
  // 기존 NodeProcessor.mapTypes() 로직
}

// StyleProcessor → buildStyles
export function buildStyles(
  ctx: BuildContext,
  stateToPseudo: (state: string) => PseudoClass | null | undefined
): BuildContext {
  // parseVariantConditionExcluding() 사용
}

// StyleProcessor → applyPositions
export function applyPositions(ctx: BuildContext): BuildContext {
  // 기존 StyleProcessor.applyPositions() 로직
}

// VisibilityProcessor → resolveVisibility
export function resolveVisibility(
  ctx: BuildContext,
  stateToPseudo: (state: string) => PseudoClass | null | undefined
): BuildContext {
  // 기존 VisibilityProcessor.resolve() 로직
}

// PropsProcessor → extractProps
export function extractProps(ctx: BuildContext): BuildContext {
  // 기존 PropsProcessor.extract() 로직
}

// PropsProcessor → bindProps
export function bindProps(ctx: BuildContext): BuildContext {
  // 기존 PropsProcessor.bindProps() 로직
}

// NodeProcessor → detectSemanticRoles
export function detectSemanticRoles(ctx: BuildContext): BuildContext {
  // 기존 NodeProcessor.detectSemanticRoles() 로직
}

// VisibilityProcessor → processHidden
export function processHidden(ctx: BuildContext): BuildContext {
  // 기존 VisibilityProcessor.processHidden() 로직
}

// StyleProcessor → handleRotation
export function handleRotation(ctx: BuildContext): BuildContext {
  // 기존 StyleProcessor.handleRotation() 로직
}

// InstanceProcessor → buildExternalRefs
export function buildExternalRefs(ctx: BuildContext): BuildContext {
  // 기존 InstanceProcessor.buildExternalRefs() 로직
}

// SlotProcessor → detectSlots
export function detectSlots(ctx: BuildContext): BuildContext {
  // isComponentReference() 사용
}

// SlotProcessor → detectTextSlots
export function detectTextSlots(ctx: BuildContext): BuildContext {
  // 기존 SlotProcessor.detectTextSlots() 로직
}

// SlotProcessor → detectArraySlots
export function detectArraySlots(ctx: BuildContext): BuildContext {
  // 기존 SlotProcessor.detectArraySlots() 로직
}

// SlotProcessor → enrichArraySlotsWithComponentNames
export function enrichArraySlotsWithComponentNames(ctx: BuildContext): BuildContext {
  // 기존 SlotProcessor.enrichArraySlotsWithComponentNames() 로직
}

// NodeConverter → buildDesignTree
export function buildDesignTree(ctx: BuildContext): BuildContext {
  // 기존 NodeConverter.assemble() 로직
}

// CleanupProcessor → cleanupNodes
export function cleanupNodes(ctx: BuildContext): BuildContext {
  // 기존 CleanupProcessor.removeHiddenNodes() 로직
}

// CleanupProcessor → removeInstanceInternalNodes
export function removeInstanceInternalNodes(ctx: BuildContext): BuildContext {
  // 기존 CleanupProcessor.removeInstanceInternalNodes() 로직
}
```

## 파일 구조 변경

### Before

```
tree-builder/
├── TreeBuilder.ts
├── heuristics/
│   ├── HeuristicsRunner.ts
│   └── components/
│       ├── IComponentHeuristic.ts
│       └── InputHeuristic.ts
└── workers/
    ├── VariantProcessor.ts
    ├── InstanceProcessor.ts
    ├── NodeProcessor.ts
    ├── StyleProcessor.ts
    ├── VisibilityProcessor.ts
    ├── PropsProcessor.ts
    ├── SlotProcessor.ts
    ├── NodeBuilder.ts
    ├── CleanupProcessor.ts
    └── utils/
        └── stateUtils.ts
```

### After

```
tree-builder/
├── TreeBuilder.ts              # 간소화 (파이프라인 분기)
├── heuristics/
│   ├── HeuristicsRunner.ts     # 간소화
│   ├── components/
│   │   ├── IComponentHeuristic.ts   # 확장
│   │   ├── GenericHeuristic.ts      # 신규 (모든 로직 포함)
│   │   ├── ButtonHeuristic.ts       # 신규
│   │   ├── InputHeuristic.ts        # 수정 (상속)
│   │   ├── CheckboxHeuristic.ts     # 신규
│   │   ├── RadioHeuristic.ts        # 신규
│   │   ├── ToggleHeuristic.ts       # 신규
│   │   └── LinkHeuristic.ts         # 신규
│   └── utils/
│       └── processorUtils.ts        # Processor 로직 추출
└── workers/
    ├── BuildContext.ts              # 유지
    ├── interfaces/                  # 유지
    └── utils/                       # 유지
        └── (stateUtils.ts 삭제)
```

## 마이그레이션 단계

### Phase 1: 인터페이스 준비
1. [ ] ComponentType에 "radio", "link" 추가 (architecture.ts)
2. [ ] IComponentHeuristic 확장 (파이프라인 메서드 추가)
3. [ ] processorUtils.ts 생성 (빈 파일)

### Phase 2: GenericHeuristic 구현
1. [ ] GenericHeuristic 생성
2. [ ] baseStateMapping 이동 (stateUtils.ts → GenericHeuristic)
3. [ ] processorUtils.ts에 공통 유틸리티 먼저 추출:
   - [ ] `parseVariantConditionExcluding()` (VisibilityProcessor에서)
   - [ ] `isComponentReference()` (NodeProcessor에서)
4. [ ] processorUtils.ts에 메인 함수 추출 (공통 유틸리티 사용):
   - [ ] `mergeVariants()`, `buildStyles()`, `detectSlots()` 등
5. [ ] GenericHeuristic에서 processorUtils 호출

### Phase 3: 특정 휴리스틱 구현
1. [ ] ButtonHeuristic 생성
2. [ ] InputHeuristic 수정 (GenericHeuristic 상속)
3. [ ] CheckboxHeuristic 생성
4. [ ] RadioHeuristic 생성
5. [ ] ToggleHeuristic 생성
6. [ ] LinkHeuristic 생성

### Phase 4: HeuristicsRunner/TreeBuilder 수정
1. [ ] HeuristicsRunner 간소화
2. [ ] TreeBuilder 간소화 (COMPONENT_SET → 휴리스틱 전체 위임)
3. [ ] 기존 Processor import 정리

### Phase 5: 정리
1. [ ] 기존 Processor 파일 삭제 또는 deprecated
2. [ ] stateUtils.ts 삭제
3. [ ] 테스트 업데이트

## 휴리스틱 우선순위

| 순서 | 휴리스틱 | 패턴 | Override 메서드 |
|-----|---------|------|----------------|
| 1 | InputHeuristic | input, textfield, caret | processAnalysis, processSlots |
| 2 | CheckboxHeuristic | checkbox | - |
| 3 | RadioHeuristic | radio | - |
| 4 | ToggleHeuristic | toggle, switch | stateMapping |
| 5 | LinkHeuristic | link, anchor | - |
| 6 | ButtonHeuristic | button, btn, cta | - |
| 7 | GenericHeuristic | (fallback) | - |

## 테스트 계획

### 테스트 파일 구조

```
test/
└── compiler/
    └── heuristics/
        ├── GenericHeuristic.test.ts
        ├── ButtonHeuristic.test.ts
        ├── InputHeuristic.test.ts
        ├── CheckboxHeuristic.test.ts
        ├── RadioHeuristic.test.ts
        ├── ToggleHeuristic.test.ts
        ├── LinkHeuristic.test.ts
        └── processorUtils.test.ts
```

### Unit Tests

| 파일 | 테스트 내용 |
|------|-----------|
| `GenericHeuristic.test.ts` | 전체 파이프라인, stateMapping, 기본 처리 |
| `ButtonHeuristic.test.ts` | canProcess (button, btn, cta 패턴) |
| `InputHeuristic.test.ts` | canProcess, placeholder 감지, slot 생성 |
| `CheckboxHeuristic.test.ts` | canProcess (checkbox 패턴) |
| `RadioHeuristic.test.ts` | canProcess (radio 패턴) |
| `ToggleHeuristic.test.ts` | canProcess, stateMapping (on/off → :checked) |
| `LinkHeuristic.test.ts` | canProcess (link, anchor 패턴) |
| `processorUtils.test.ts` | 각 유틸리티 함수 단위 테스트 |

### Integration Tests

| 테스트 | Fixture | 예상 휴리스틱 |
|--------|---------|-------------|
| Primary 버튼 | `Primary.json` | ButtonHeuristic |
| Input 컴포넌트 | `InputBoxstandard.json` | InputHeuristic |
| 미지정 컴포넌트 | 기타 | GenericHeuristic |

### 통과 조건

- [ ] 기존 658개 테스트 전체 통과
- [ ] 새 휴리스틱 테스트 전체 통과

## 위험 요소

| 위험 | 대응 |
|-----|------|
| 대규모 리팩토링 | Phase별 점진적 진행, 각 Phase 후 테스트 |
| Processor 로직 이동 중 버그 | processorUtils를 먼저 만들고 기존 Processor에서 호출 |
| 순환 참조 | utils/ 레이어 분리 |
| 성능 저하 | 불필요한 객체 생성 최소화 |

## 완료 조건

- [ ] 모든 기존 테스트 통과 (658개)
- [ ] TreeBuilder.build() 코드 50줄 이하
- [ ] HeuristicsRunner.run() 코드 20줄 이하
- [ ] 각 휴리스틱이 독립적으로 테스트 가능
- [ ] Processor 파일 삭제 완료
