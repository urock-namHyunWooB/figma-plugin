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
 */

import type {
  ComponentType,
  InternalNode,
  ConditionNode,
  VariantPropDefinition,
} from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import { rewritePropConditions, rewriteStateDynamicStyles } from "./rewritePropConditions";
import { isDisableProp } from "./propPatterns";

/** Figma state variant 값 → 내부 상태 매핑 */
const STATE_PATTERNS: Array<{
  pattern: RegExp;
  state: "checked" | "indeterminate";
}> = [
  { pattern: /^checked$/i, state: "checked" },
  { pattern: /^indeterminate$/i, state: "indeterminate" },
];

export class CheckboxHeuristic implements IHeuristic {
  readonly name = "CheckboxHeuristic";
  readonly componentType: ComponentType = "unknown";

  score(ctx: HeuristicContext): number {
    if (/checkbox/i.test(ctx.componentName)) return 20;
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    // Figma state variant에서 사용 가능한 상태 감지
    const { removedProp, detectedStates } = this.removeAndDetectStateProp(ctx);

    const hasIndeterminate = detectedStates.includes("indeterminate");

    // checked, onCheckedChange, disable prop 추가
    this.addCheckedProp(ctx, hasIndeterminate);
    const onChangeName = this.addOnCheckedChangeProp(ctx, hasIndeterminate);
    const disableName = this.addDisableProp(ctx);

    // 루트에 onClick + disabled 바인딩
    ctx.tree.bindings = { ...ctx.tree.bindings, attrs: {
      ...ctx.tree.bindings?.attrs,
      onClick: { expr: `() => ${onChangeName}?.(!checked)` },
      disabled: { prop: disableName },
    }};

    // check/indeterminate 아이콘 slot → 조건부 렌더링으로 변환
    this.convertIconSlots(ctx);

    // 제거된 prop이 있으면 트리 전체의 조건 참조를 대체 ConditionNode로 치환
    if (removedProp) {
      const stateConditionMap = this.buildConditionMap(detectedStates);
      rewritePropConditions(ctx.tree, removedProp, stateConditionMap);
      rewriteStateDynamicStyles(ctx.tree, removedProp, stateConditionMap);
    }

    return {
      componentType: this.componentType,
      rootNodeType: "button",
    };
  }

  /**
   * Figma state variant prop을 제거하고, 감지된 상태 목록을 반환
   */
  private removeAndDetectStateProp(ctx: HeuristicContext): {
    removedProp: string | null;
    detectedStates: Array<"checked" | "indeterminate">;
  } {
    const idx = ctx.props.findIndex((p) => p.name === "state");
    if (idx === -1) return { removedProp: null, detectedStates: ["checked"] };

    const stateProp = ctx.props[idx];
    const removedProp = stateProp.name;
    ctx.props.splice(idx, 1);

    // variant options에서 상태 감지
    const options = (stateProp as VariantPropDefinition).options ?? [];
    const detectedStates: Array<"checked" | "indeterminate"> = [];

    for (const option of options) {
      for (const { pattern, state } of STATE_PATTERNS) {
        if (pattern.test(option) && !detectedStates.includes(state)) {
          detectedStates.push(state);
        }
      }
    }

    // 최소한 checked는 포함
    if (!detectedStates.includes("checked")) {
      detectedStates.unshift("checked");
    }

    return { removedProp, detectedStates };
  }

  /**
   * 감지된 상태에 따라 Figma variant 값 → ConditionNode 매핑 생성
   */
  private buildConditionMap(
    detectedStates: Array<"checked" | "indeterminate">
  ): Record<string, ConditionNode> {
    const map: Record<string, ConditionNode> = {};

    for (const state of detectedStates) {
      // Figma variant 값(PascalCase) → ConditionNode
      const variantKey = state.charAt(0).toUpperCase() + state.slice(1);
      if (state === "checked") {
        map[variantKey] = { type: "eq", prop: "checked", value: true };
      } else {
        map[variantKey] = { type: "eq", prop: "checked", value: state };
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
      defaultValue: undefined,
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

}
