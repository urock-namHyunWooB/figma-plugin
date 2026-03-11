/**
 * CheckboxHeuristic
 *
 * 체크박스 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: checkbox, check (+20)
 *
 * 추가 기능:
 * - checked?: boolean | "indeterminate" prop 추가 (Radix UI 패턴)
 *   - indeterminate 유무는 Figma state variant options에서 동적 감지
 * - onCheckedChange 콜백 prop 추가
 * - 루트에 onClick + disabled 처리
 * - check/indeterminate 아이콘 INSTANCE의 slot → 조건부 렌더링으로 변환
 * - on/off prop → checked로 통합 (조건 리네임)
 * - disable state → CSS :disabled pseudo + disable prop
 */

import type {
  ComponentType,
  InternalNode,
  ConditionNode,
  PseudoClass,
  VariantPropDefinition,
} from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import {
  rewritePropConditions,
  rewriteStateDynamicStyles,
  convertStateDynamicToPseudo,
  renamePropInConditions,
} from "../processors/utils/rewritePropConditions";
import { isDisableProp, isStateProp } from "../processors/utils/propPatterns";

/** Figma state variant 값 → checkbox 내부 상태 매핑 */
const CHECKED_STATE_PATTERNS: Array<{
  pattern: RegExp;
  state: "checked" | "indeterminate";
}> = [
  { pattern: /^checked$/i, state: "checked" },
  { pattern: /^active$/i, state: "checked" },
  { pattern: /^indeterminate$/i, state: "indeterminate" },
  { pattern: /^partial$/i, state: "indeterminate" },
];

/** disable 상태 패턴 */
const DISABLE_PATTERN = /^disabl/i;

/** on/off prop 이름 패턴 */
const ON_OFF_PATTERN = /^on\/?off$/i;

/** disable → :disabled CSS pseudo 매핑 */
const DISABLE_PSEUDO_MAP: Record<string, PseudoClass> = {
  disable: ":disabled",
  disabled: ":disabled",
};

export class CheckboxHeuristic implements IHeuristic {
  readonly name = "CheckboxHeuristic";
  readonly componentType: ComponentType = "unknown";

  score(ctx: HeuristicContext): number {
    if (/checkbox/i.test(ctx.componentName)) return 20;
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    // 1. states prop 제거 + 상태 감지
    const { removedProp, detectedStates, optionToState, allOptions } =
      this.removeAndDetectStateProp(ctx);

    // 2. on/off prop 제거
    const onOffPropName = this.removeOnOffProp(ctx);

    const hasIndeterminate = detectedStates.includes("indeterminate");

    // 3. checked, onCheckedChange, disable prop 추가
    this.addCheckedProp(ctx, hasIndeterminate);
    const onChangeName = this.addOnCheckedChangeProp(ctx, hasIndeterminate);
    const disableName = this.addDisableProp(ctx);

    // 4. 루트에 onClick + disabled 바인딩
    ctx.tree.bindings = { ...ctx.tree.bindings, attrs: {
      ...ctx.tree.bindings?.attrs,
      onClick: { expr: `() => ${onChangeName}?.(!checked)` },
      disabled: { prop: disableName },
    }};

    // 5. check/indeterminate 아이콘 slot → 조건부 렌더링으로 변환
    this.convertIconSlots(ctx);

    // 6. on/off → checked 조건 리네임 (truthy(onOff) → truthy(checked))
    if (onOffPropName) {
      renamePropInConditions(ctx.tree, onOffPropName, "checked");
    }

    // 7. states prop 제거 후 조건 치환
    if (removedProp) {
      // 7a. disable state → CSS :disabled pseudo 변환
      convertStateDynamicToPseudo(ctx.tree, removedProp, DISABLE_PSEUDO_MAP);

      // 7b. checked/indeterminate 조건 매핑 + disable 조건 매핑
      const conditionMap = this.buildConditionMap(optionToState, disableName, allOptions);
      rewritePropConditions(ctx.tree, removedProp, conditionMap);
      rewriteStateDynamicStyles(ctx.tree, removedProp, conditionMap);
    }

    // 8. 아이콘 조건 보정 — truthy(checked) → eq(checked, true) (checkmark only)
    this.refineIconConditions(ctx.tree);

    // 9. SVG 전용 속성 → CSS 속성 변환 (variant 병합 시 shape 타입 호환으로 인한 오류)
    this.convertSvgPropsToCss(ctx.tree);

    // 10. SVG variant의 border-radius 보정 (VECTOR에는 border-radius 개념 없음)
    this.normalizeBorderRadiusForSvgVariants(ctx.tree);

    return {
      componentType: this.componentType,
      rootNodeType: "button",
    };
  }

  /**
   * Figma state variant prop을 제거하고, 감지된 상태 목록과 매핑을 반환
   */
  private removeAndDetectStateProp(ctx: HeuristicContext): {
    removedProp: string | null;
    detectedStates: Array<"checked" | "indeterminate">;
    optionToState: Map<string, "checked" | "indeterminate">;
    allOptions: string[];
  } {
    const idx = ctx.props.findIndex((p) => isStateProp(p.name));
    if (idx === -1) {
      return {
        removedProp: null,
        detectedStates: ["checked"],
        optionToState: new Map(),
        allOptions: [],
      };
    }

    const stateProp = ctx.props[idx];
    const removedProp = stateProp.name;
    ctx.props.splice(idx, 1);

    // variant options에서 상태 감지
    const allOptions = (stateProp as VariantPropDefinition).options ?? [];
    const detectedStates: Array<"checked" | "indeterminate"> = [];
    const optionToState = new Map<string, "checked" | "indeterminate">();

    for (const option of allOptions) {
      for (const { pattern, state } of CHECKED_STATE_PATTERNS) {
        if (pattern.test(option)) {
          optionToState.set(option, state);
          if (!detectedStates.includes(state)) {
            detectedStates.push(state);
          }
          break;
        }
      }
    }

    // 최소한 checked는 포함
    if (!detectedStates.includes("checked")) {
      detectedStates.unshift("checked");
    }

    return { removedProp, detectedStates, optionToState, allOptions };
  }

  /**
   * on/off prop 제거 (checked로 통합)
   * @returns 제거된 prop의 normalized name, 없으면 null
   */
  private removeOnOffProp(ctx: HeuristicContext): string | null {
    const idx = ctx.props.findIndex((p) => ON_OFF_PATTERN.test(p.sourceKey || p.name));
    if (idx === -1) return null;

    const prop = ctx.props[idx];
    const propName = prop.name;
    ctx.props.splice(idx, 1);
    return propName;
  }

  /**
   * Figma variant 값 → ConditionNode 매핑 생성
   *
   * checked/indeterminate: optionToState에서 매핑
   * disable: truthy(disableProp)
   * default 등: conditionMap에 없으면 조건 제거 (기본 상태)
   */
  private buildConditionMap(
    optionToState: Map<string, "checked" | "indeterminate">,
    disablePropName: string,
    allOptions: string[]
  ): Record<string, ConditionNode> {
    const map: Record<string, ConditionNode> = {};

    // checked/indeterminate 매핑
    for (const [option, state] of optionToState) {
      if (state === "checked") {
        map[option] = { type: "eq", prop: "checked", value: true };
      } else {
        map[option] = { type: "eq", prop: "checked", value: state };
      }
    }

    // disable 매핑
    for (const option of allOptions) {
      if (DISABLE_PATTERN.test(option) && !(option in map)) {
        map[option] = { type: "truthy", prop: disablePropName };
      }
    }

    return map;
  }

  private addCheckedProp(
    ctx: HeuristicContext,
    hasIndeterminate: boolean
  ): void {
    if (ctx.props.some((p) => p.name === "checked")) return;
    ctx.props.push({
      type: "boolean",
      name: "checked",
      defaultValue: false,
      required: false,
      sourceKey: "",
      ...(hasIndeterminate ? { extraValues: ["indeterminate"] } : {}),
    });
  }

  private addOnCheckedChangeProp(
    ctx: HeuristicContext,
    hasIndeterminate: boolean
  ): string {
    const name = "onCheckedChange";
    if (!ctx.props.some((p) => p.name === name)) {
      const paramType = hasIndeterminate
        ? 'boolean | "indeterminate"'
        : "boolean";
      ctx.props.push({
        type: "function",
        name,
        defaultValue: undefined,
        required: false,
        sourceKey: "",
        functionSignature: `(checked: ${paramType}) => void`,
      });
    }
    return name;
  }

  private addDisableProp(ctx: HeuristicContext): string {
    const existing = ctx.props.find((p) => isDisableProp(p.name));
    if (existing) return existing.name;

    const name = "disable";
    ctx.props.push({
      type: "boolean",
      name,
      defaultValue: false,
      required: false,
      sourceKey: "",
    });
    return name;
  }

  /**
   * slot binding이 있는 아이콘 INSTANCE를 인라인 렌더링으로 변환
   */
  private convertIconSlots(ctx: HeuristicContext): void {
    this.convertSlotBindingsRecursive(ctx.tree, ctx);
  }

  private convertSlotBindingsRecursive(node: InternalNode, ctx: HeuristicContext): void {
    if (node.type === "INSTANCE") {
      if (node.bindings?.content && "prop" in node.bindings.content) {
        const slotPropName = node.bindings.content.prop;
        const condition = this.resolveCondition(node.name);

        if (condition) {
          // slot binding 제거 → inline 컴포넌트로 렌더링
          delete node.bindings.content;
          if (Object.keys(node.bindings).length === 0) {
            delete (node as any).bindings;
          }

          // 조건부 렌더링
          node.visibleCondition = condition;

          // 대응 slot prop 제거
          const propIndex = ctx.props.findIndex((p) => p.name === slotPropName);
          if (propIndex !== -1) {
            ctx.props.splice(propIndex, 1);
          }

          return;
        }
      }
    }

    for (const child of node.children || []) {
      this.convertSlotBindingsRecursive(child, ctx);
    }
  }

  /**
   * 노드 이름으로 조건 ConditionNode 추론
   * - "check"가 포함되고 "checkbox"가 아닌 경우 → eq(checked, true)
   * - "lineHorizontal" 또는 "indeterminate" 포함 → eq(checked, "indeterminate")
   */
  private resolveCondition(nodeName: string): ConditionNode | null {
    const lower = nodeName.toLowerCase().replace(/\s+/g, "");
    if (/check(?!box)/.test(lower)) return { type: "eq", prop: "checked", value: true };
    if (/linehorizontal|indeterminate/.test(lower)) return { type: "eq", prop: "checked", value: "indeterminate" };
    return null;
  }

  /**
   * 아이콘 노드의 visibility 조건 보정
   *
   * variant 병합 후 checkmark 아이콘이 active+partial 양쪽에서 머지되면
   * truthy(checked) 조건이 됨. 하지만 checkmark은 checked=true에서만 보여야 함.
   *
   * 이름 기반으로 check 아이콘은 eq(checked, true)로 교체.
   */
  private refineIconConditions(tree: InternalNode): void {
    for (const child of tree.children) {
      if (child.visibleCondition) {
        const condition = this.resolveConditionForRefinement(child.name);
        if (condition) {
          child.visibleCondition = condition;
        }
      }
      this.refineIconConditions(child);
    }
  }

  /**
   * 이름 기반 조건 매핑 (refineIconConditions용)
   * - "check" 포함 (checkbox 제외): checked === true
   * - "icon_checking" 등 체크마크 아이콘: checked === true
   */
  private resolveConditionForRefinement(nodeName: string): ConditionNode | null {
    const lower = nodeName.toLowerCase().replace(/[\s_-]+/g, "");
    // "checking", "check", "checkmark" 등 — checkbox 자체는 제외
    if (/check(?!box)/.test(lower)) {
      return { type: "eq", prop: "checked", value: true };
    }
    return null;
  }

  /** SVG fill/stroke → CSS background/border 변환 (shape 타입 병합 부산물) */
  private static readonly SVG_TO_CSS: Record<string, string> = {
    fill: "background",
    stroke: "borderColor",
    "stroke-width": "borderWidth",
    strokeWidth: "borderWidth",
  };

  /**
   * styles.dynamic 내 SVG 전용 속성을 CSS 속성으로 변환
   *
   * variant 병합 시 RECTANGLE + VECTOR/ELLIPSE가 shape 호환으로 머지되면
   * 한 variant의 스타일이 SVG 속성(fill, stroke)으로 들어옴.
   * HTML 렌더링에서는 CSS 속성(background, border-color)이 필요.
   */
  private convertSvgPropsToCss(tree: InternalNode): void {
    if (tree.styles?.dynamic) {
      for (const entry of tree.styles.dynamic) {
        this.convertStyleEntry(entry.style);
      }
    }
    if (tree.styles?.base) {
      this.convertStyleEntry(tree.styles.base);
    }
    for (const child of tree.children) {
      this.convertSvgPropsToCss(child);
    }
  }

  private convertStyleEntry(style: Record<string, string | number>): void {
    let hadSvgBorder = false;
    for (const [svgProp, cssProp] of Object.entries(CheckboxHeuristic.SVG_TO_CSS)) {
      if (svgProp in style) {
        const value = style[svgProp];
        delete style[svgProp];
        if (cssProp === "borderWidth" && typeof value === "number") {
          style[cssProp] = `${value}px`;
        } else {
          style[cssProp] = value;
        }
        if (cssProp === "borderColor" || cssProp === "borderWidth") {
          hadSvgBorder = true;
        }
      }
    }
    // SVG stroke → CSS border 변환 시 border-style 보완
    // SVG에는 border-style 개념이 없으므로 solid 추가
    if (hadSvgBorder && !("border-style" in style) && !("borderStyle" in style)) {
      style["border-style"] = "solid";
    }
  }

  /**
   * SVG→CSS 변환된 동적 스타일에 border-radius 보정
   *
   * RECTANGLE+VECTOR 노드 병합 시 VECTOR variant의 스타일에는 border-radius가 없음.
   * 같은 노드의 다른 variant에 border-radius가 있으면, SVG 변환된 entry에도 추가.
   */
  private normalizeBorderRadiusForSvgVariants(tree: InternalNode): void {
    if (tree.styles?.dynamic && tree.styles.dynamic.length > 1) {
      // 다른 entry에서 border-radius 수집
      let borderRadius: string | number | undefined;
      for (const entry of tree.styles.dynamic) {
        const br = entry.style["border-radius"] ?? entry.style["borderRadius"];
        if (br !== undefined) {
          borderRadius = br;
          break;
        }
      }

      // border 속성이 있지만 border-radius가 없는 entry에 추가
      if (borderRadius !== undefined) {
        for (const entry of tree.styles.dynamic) {
          const hasBorder = "borderColor" in entry.style || "border-color" in entry.style ||
                            "borderWidth" in entry.style || "border-width" in entry.style ||
                            "border-style" in entry.style || "border" in entry.style;
          const hasBorderRadius = "borderRadius" in entry.style || "border-radius" in entry.style;
          if (hasBorder && !hasBorderRadius) {
            entry.style["border-radius"] = borderRadius;
          }
        }
      }
    }
    for (const child of tree.children) {
      this.normalizeBorderRadiusForSvgVariants(child);
    }
  }

}
