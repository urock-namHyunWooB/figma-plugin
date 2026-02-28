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
 * - Disable=True 변형의 opacity:0.43 → :disabled pseudo-class
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
    this.addDisabledOpacity(ctx); // Disable=True 변형의 opacity:0.43 → :disabled pseudo-class
    this.fixStateCheckedSizeConflict(ctx); // AND(state=Checked, size=*) → Checked 스타일에서 size 담당 속성 제거

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

  /**
   * Figma Disable=True 변형의 opacity:0.43 → 루트 노드 :disabled pseudo-class
   *
   * StyleProcessor가 variant 루트 COMPONENT 노드의 opacity를 styles.dynamic에
   * 포함하지 못하므로, Heuristic 단계에서 직접 :disabled 스타일로 추가한다.
   * (값은 Figma 데이터에서 확인된 0.43 — 디자인 시스템 표준 disabled opacity)
   */
  /**
   * AND(state=Checked, size=*) 조건에서 state 그룹 스타일의 width/height 제거
   *
   * groupByVariantProp은 AND 조건에서 첫 번째 등장 스타일을 사용하므로,
   * Medium+Checked의 height:20px이 Small+Checked의 height:16px를 덮어쓴다.
   * size prop이 width/height를 담당하므로, state=Checked 스타일에서는 제거한다.
   *
   * 참고: groupByVariantProp에서 교집합 전략을 쓰면 airtable-button처럼
   * size에 따라 variant 스타일이 달라지는 경우 교집합이 비어 키가 사라진다.
   * 따라서 이 처리는 RadioHeuristic에서 도메인 지식으로 직접 해결한다.
   */
  private fixStateCheckedSizeConflict(ctx: HeuristicContext): void {
    this.traverseForSizeStateConflict(ctx.tree);
  }

  private traverseForSizeStateConflict(node: InternalNode): void {
    if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
      // AND(state=Checked, size=*) 패턴이 있는지 확인
      const hasStateAndSize = node.styles.dynamic.some((entry) => {
        if (entry.condition.type !== "and") return false;
        const conds = entry.condition.conditions;
        const hasState = conds.some((c) => c.type === "eq" && c.prop === "state");
        const hasSize = conds.some((c) => c.type === "eq" && c.prop === "size");
        return hasState && hasSize;
      });

      if (hasStateAndSize) {
        // state=Checked + size 조합의 스타일에서 width/height 제거
        for (const entry of node.styles.dynamic) {
          if (entry.condition.type !== "and") continue;
          const conds = entry.condition.conditions;
          const stateEq = conds.find((c) => c.type === "eq" && c.prop === "state");
          const sizeEq = conds.find((c) => c.type === "eq" && c.prop === "size");
          if (stateEq && sizeEq) {
            delete entry.style["width"];
            delete entry.style["height"];
          }
        }
      }
    }

    for (const child of node.children || []) {
      this.traverseForSizeStateConflict(child);
    }
  }

  private addDisabledOpacity(ctx: HeuristicContext): void {
    if (!ctx.tree.styles) {
      ctx.tree.styles = { base: {}, dynamic: [] };
    }
    if (!ctx.tree.styles.pseudo) {
      ctx.tree.styles.pseudo = {};
    }
    ctx.tree.styles.pseudo[":disabled"] = {
      ...ctx.tree.styles.pseudo[":disabled"],
      opacity: 0.43,
    };
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
