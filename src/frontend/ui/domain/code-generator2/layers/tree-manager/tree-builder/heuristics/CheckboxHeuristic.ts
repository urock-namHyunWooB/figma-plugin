/**
 * CheckboxHeuristic
 *
 * 체크박스 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: checkbox, check (+20)
 *
 * 추가 기능:
 * - checked?: boolean prop 추가
 * - onChange?: (checked: boolean) => void prop 추가
 * - 루트에 onClick + disabled 처리
 * - check/indeterminate 아이콘 INSTANCE의 slot → state 기반 조건부 렌더링으로 변환
 */

import type { ComponentType, InternalNode, ConditionNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class CheckboxHeuristic implements IHeuristic {
  readonly name = "CheckboxHeuristic";
  readonly componentType: ComponentType = "unknown";

  score(ctx: HeuristicContext): number {
    if (/checkbox/i.test(ctx.componentName)) return 20;
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    // 루트에 semanticType 설정
    ctx.tree.semanticType = "checkbox";

    // checked, onChange, disable prop 추가
    this.addCheckedProp(ctx);
    this.addOnChangeProp(ctx);
    this.addDisableProp(ctx);

    // check/indeterminate 아이콘 slot → state 조건부 렌더링으로 변환
    this.convertIconSlotsToStateConditions(ctx);

    return {
      componentType: this.componentType,
      rootNodeType: "button",
    };
  }

  private addCheckedProp(ctx: HeuristicContext): void {
    if (ctx.props.some((p) => p.name === "checked")) return;
    ctx.props.push({
      type: "boolean",
      name: "checked",
      defaultValue: false,
      required: false,
      sourceKey: "",
    });
  }

  private addOnChangeProp(ctx: HeuristicContext): void {
    if (ctx.props.some((p) => p.name === "onChange")) return;
    ctx.props.push({
      type: "function",
      name: "onChange",
      defaultValue: undefined,
      required: false,
      sourceKey: "",
      functionSignature: "(checked: boolean) => void",
    });
  }

  private addDisableProp(ctx: HeuristicContext): void {
    if (ctx.props.some((p) => p.name === "disable")) return;
    ctx.props.push({
      type: "boolean",
      name: "disable",
      defaultValue: false,
      required: false,
      sourceKey: "",
    });
  }

  /**
   * slot으로 추출된 check/indeterminate 아이콘 INSTANCE를
   * state prop 기반 조건부 렌더링으로 변환한다.
   *
   * - 노드 이름에 "check" 포함 (checkbox 제외) → state === "Checked"
   * - 노드 이름에 "lineHorizontal" / "indeterminate" 포함 → state === "Indeterminate"
   */
  private convertIconSlotsToStateConditions(ctx: HeuristicContext): void {
    this.traverseForIconSlots(ctx.tree, ctx);
  }

  private traverseForIconSlots(node: InternalNode, ctx: HeuristicContext): void {
    if (node.type === "INSTANCE") {
      // Path A: slot binding이 있는 INSTANCE (SlotProcessor가 이미 처리한 경우)
      if (node.bindings?.content && "prop" in node.bindings.content) {
        const slotPropName = node.bindings.content.prop;
        const stateValue = this.resolveStateValue(node.name);

        if (stateValue) {
          // 1. slot binding 제거 → inline 컴포넌트로 렌더링
          delete node.bindings.content;
          if (Object.keys(node.bindings).length === 0) {
            delete (node as any).bindings;
          }

          // 2. state 기반 visibleCondition 설정
          node.visibleCondition = { type: "eq", prop: "state", value: stateValue };

          // 3. 대응 slot prop 제거
          const propIndex = ctx.props.findIndex((p) => p.name === slotPropName);
          if (propIndex !== -1) {
            ctx.props.splice(propIndex, 1);
          }

          return; // 자식은 탐색 불필요
        }
      }

      // Path B: slot binding 없이 이름 패턴으로 직접 state 조건 추가
      // (VisibilityProcessor가 "Checked"를 CSS pseudo-class로 취급해 조건을 생략한 경우)
      const stateValue = this.resolveStateValue(node.name);
      if (stateValue) {
        // 이미 state 조건이 포함되어 있으면 중복 추가 방지
        if (!this.hasStateCondition(node.visibleCondition)) {
          const stateCondition: ConditionNode = { type: "eq", prop: "state", value: stateValue };
          if (!node.visibleCondition) {
            node.visibleCondition = stateCondition;
          } else {
            // 기존 조건(예: size === "Small" && tight)에 state 조건을 and로 추가
            node.visibleCondition = {
              type: "and",
              conditions: [node.visibleCondition, stateCondition],
            };
          }
        }
        return; // 자식은 탐색 불필요
      }
    }

    for (const child of node.children || []) {
      this.traverseForIconSlots(child, ctx);
    }
  }

  /**
   * 노드 이름으로 state 값 추론
   * - "check"가 포함되고 "checkbox"가 아닌 경우 → "Checked"
   * - "lineHorizontal" 또는 "indeterminate" 포함 → "Indeterminate"
   */
  private resolveStateValue(nodeName: string): "Checked" | "Indeterminate" | null {
    // 공백 제거 후 패턴 매칭 (예: "Line Horizontal" → "linehorizontal")
    const lower = nodeName.toLowerCase().replace(/\s+/g, "");
    if (/check(?!box)/.test(lower)) return "Checked";
    if (/linehorizontal|indeterminate/.test(lower)) return "Indeterminate";
    return null;
  }

  /**
   * visibleCondition 트리에 이미 state prop 조건이 있는지 확인
   * (VisibilityProcessor가 이미 state 조건을 설정한 경우 중복 추가 방지)
   */
  private hasStateCondition(condition: ConditionNode | undefined): boolean {
    if (!condition) return false;
    if (condition.type === "eq" && condition.prop === "state") return true;
    if (condition.type === "neq" && condition.prop === "state") return true;
    if (condition.type === "truthy" && condition.prop === "state") return true;
    if (condition.type === "and") {
      return condition.conditions.some((c) => this.hasStateCondition(c));
    }
    if (condition.type === "or") {
      return condition.conditions.some((c) => this.hasStateCondition(c));
    }
    if (condition.type === "not") {
      return this.hasStateCondition(condition.condition);
    }
    return false;
  }
}
