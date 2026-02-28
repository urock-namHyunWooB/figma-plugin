/**
 * RadioHeuristic
 *
 * 라디오 버튼 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: radio (+20)
 *
 * 추가 기능:
 * - checked?: boolean prop 추가
 * - onChange?: (checked: boolean) => void prop 추가
 * - 루트에 onClick + disabled 처리
 * - dot 아이콘 INSTANCE의 slot → state 기반 조건부 렌더링으로 변환
 * - interactionNormal slot 제거 (내부 처리)
 */

import type { ComponentType, InternalNode, ConditionNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class RadioHeuristic implements IHeuristic {
  readonly name = "RadioHeuristic";
  readonly componentType: ComponentType = "unknown";

  score(ctx: HeuristicContext): number {
    if (/\bradio\b/i.test(ctx.componentName)) return 20;
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    ctx.tree.semanticType = "checkbox"; // button semanticType으로 onClick/disabled 처리

    this.removeStateProp(ctx);
    this.removeTightProp(ctx); // tight는 Radio 외부 인터페이스에 불필요
    this.addCheckedProp(ctx);
    this.addOnChangeProp(ctx);
    this.addDisableProp(ctx);

    // dot 아이콘 slot → state 조건부 렌더링으로 변환
    // interactionNormal slot 제거
    this.convertIconSlotsToStateConditions(ctx);

    return {
      componentType: this.componentType,
      rootNodeType: "button",
      derivedVars: [
        {
          name: "state",
          expression: `checked ? "Checked" : "Unchecked"`,
        },
      ],
    };
  }

  private removeStateProp(ctx: HeuristicContext): void {
    const idx = ctx.props.findIndex((p) => p.name === "state");
    if (idx !== -1) ctx.props.splice(idx, 1);
  }

  private removeTightProp(ctx: HeuristicContext): void {
    const idx = ctx.props.findIndex((p) => p.name === "tight");
    if (idx !== -1) ctx.props.splice(idx, 1);
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

  private convertIconSlotsToStateConditions(ctx: HeuristicContext): void {
    this.traverseForIconSlots(ctx.tree, ctx);
  }

  private traverseForIconSlots(node: InternalNode, ctx: HeuristicContext): void {
    if (node.type === "INSTANCE") {
      // Path A: slot binding이 있는 INSTANCE
      if (node.bindings?.content && "prop" in node.bindings.content) {
        const slotPropName = node.bindings.content.prop;
        const stateValue = this.resolveStateValue(node.name);

        if (stateValue) {
          // slot binding 제거 → state 기반 visibleCondition 설정
          delete node.bindings.content;
          if (Object.keys(node.bindings).length === 0) {
            delete (node as any).bindings;
          }
          node.visibleCondition = { type: "eq", prop: "state", value: stateValue };

          // 대응 slot prop 제거
          const propIndex = ctx.props.findIndex((p) => p.name === slotPropName);
          if (propIndex !== -1) ctx.props.splice(propIndex, 1);
          return;
        }

        // interactionNormal 같은 내부 slot 제거 (state 조건 불필요)
        if (this.isInternalSlot(slotPropName)) {
          delete node.bindings.content;
          if (Object.keys(node.bindings).length === 0) {
            delete (node as any).bindings;
          }
          const propIndex = ctx.props.findIndex((p) => p.name === slotPropName);
          if (propIndex !== -1) ctx.props.splice(propIndex, 1);
          return;
        }
      }

      // Path B: slot binding 없이 이름 패턴으로 직접 state 조건 추가
      const stateValue = this.resolveStateValue(node.name);
      if (stateValue && !this.hasStateCondition(node.visibleCondition)) {
        const stateCondition: ConditionNode = { type: "eq", prop: "state", value: stateValue };
        if (!node.visibleCondition) {
          node.visibleCondition = stateCondition;
        } else {
          node.visibleCondition = { type: "and", conditions: [node.visibleCondition, stateCondition] };
        }
        return;
      }
    }

    for (const child of node.children || []) {
      this.traverseForIconSlots(child, ctx);
    }
  }

  /**
   * 노드 이름으로 state 값 추론
   * - "dot" 포함 → "Checked"
   */
  private resolveStateValue(nodeName: string): "Checked" | null {
    const lower = nodeName.toLowerCase().replace(/\s+/g, "");
    if (/dot/.test(lower)) return "Checked";
    return null;
  }

  /**
   * Interaction 같은 내부 전용 slot인지 확인
   */
  private isInternalSlot(propName: string): boolean {
    return /interaction/i.test(propName);
  }

  private hasStateCondition(condition: ConditionNode | undefined): boolean {
    if (!condition) return false;
    if (condition.type === "eq" && condition.prop === "state") return true;
    if (condition.type === "neq" && condition.prop === "state") return true;
    if (condition.type === "truthy" && condition.prop === "state") return true;
    if (condition.type === "and") return condition.conditions.some((c) => this.hasStateCondition(c));
    if (condition.type === "or") return condition.conditions.some((c) => this.hasStateCondition(c));
    if (condition.type === "not") return this.hasStateCondition(condition.condition);
    return false;
  }
}
