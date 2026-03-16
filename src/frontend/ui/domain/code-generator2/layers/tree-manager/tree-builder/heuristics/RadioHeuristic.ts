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

import type { ComponentType, InternalNode, ConditionNode, VariantPropDefinition } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import { rewritePropConditions, rewriteStateDynamicStyles } from "../processors/utils/rewritePropConditions";
import { isCheckedProp, isDisableProp, isStateProp } from "../processors/utils/propPatterns";

/** variant 값에서 "checked" 상태를 감지하는 패턴 */
const CHECKED_VALUE_PATTERNS = /^(checked|active|selected|on)$/i;

export class RadioHeuristic implements IHeuristic {
  readonly name = "RadioHeuristic";
  readonly componentType: ComponentType = "unknown";

  score(ctx: HeuristicContext): number {
    if (/\bradio\b/i.test(ctx.componentName)) return 20;
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    const { removedProp, checkedValues } = this.removeStateProp(ctx);
    this.removeTightProp(ctx); // tight는 Radio 외부 인터페이스에 불필요
    const checkedName = this.addCheckedProp(ctx);
    const onChangeName = this.addOnChangeProp(ctx);
    const disableName = this.addDisableProp(ctx);

    // 루트에 onClick + disabled 바인딩
    ctx.tree.bindings = { ...ctx.tree.bindings, attrs: {
      ...ctx.tree.bindings?.attrs,
      onClick: { expr: `() => ${onChangeName}?.(!${checkedName})` },
      disabled: { prop: disableName },
    }};
    this.addDisabledOpacity(ctx); // Disable=True 변형의 opacity:0.43 → :disabled pseudo-class
    this.fixStateCheckedSizeConflict(ctx, removedProp); // AND(state=Checked, size=*) → Checked 스타일에서 size 담당 속성 제거

    // dot 아이콘 slot → boolean prop 조건부 렌더링으로 변환
    // interactionNormal slot 제거
    this.convertIconSlots(ctx);

    // TEXT 노드를 text prop으로 바인딩
    this.addTextProp(ctx);

    // 제거된 prop이 있으면 트리 전체의 조건 참조를 boolean prop으로 치환
    if (removedProp) {
      // variant 값에서 동적으로 conditionMap 생성
      // checked/active/selected → truthy(checked), 나머지는 default(map에 없음)
      const stateConditionMap: Record<string, ConditionNode> = {};
      for (const val of checkedValues) {
        stateConditionMap[val] = { type: "truthy", prop: "checked" };
      }
      rewritePropConditions(ctx.tree, removedProp, stateConditionMap);
      rewriteStateDynamicStyles(ctx.tree, removedProp, stateConditionMap);
    }

    return {
      componentType: this.componentType,
      rootNodeType: "button",
    };
  }

  /**
   * state/states variant prop을 제거하고, "checked" 상태에 해당하는 variant 값 목록 반환
   *
   * variant options에서 checked/active/selected/on 패턴 → checked 상태
   * 나머지(disable, unchecked 등) → default(비선택) 상태
   */
  private removeStateProp(ctx: HeuristicContext): {
    removedProp: string | null;
    checkedValues: string[];
  } {
    const idx = ctx.props.findIndex((p) => isStateProp(p.name));
    if (idx === -1) return { removedProp: null, checkedValues: [] };

    const stateProp = ctx.props[idx];
    const removedProp = stateProp.name;
    ctx.props.splice(idx, 1);

    // variant options에서 checked 상태 값 감지
    const options = (stateProp as VariantPropDefinition).options ?? [];
    const checkedValues = options.filter((opt) => CHECKED_VALUE_PATTERNS.test(opt));

    // 패턴 매칭 실패 시 기존 "Checked" 키 폴백
    if (checkedValues.length === 0) {
      checkedValues.push("Checked");
    }

    return { removedProp, checkedValues };
  }

  private removeTightProp(ctx: HeuristicContext): void {
    const idx = ctx.props.findIndex((p) => p.name === "tight");
    if (idx !== -1) ctx.props.splice(idx, 1);
  }

  private addCheckedProp(ctx: HeuristicContext): string {
    const existing = ctx.props.find((p) => isCheckedProp(p.name));
    if (existing) return existing.name;

    // "check" 같은 boolean variant를 "checked"로 rename
    const checkVariant = ctx.props.find(
      (p) => p.type === "boolean" && /^check$/i.test(p.name)
    );
    if (checkVariant) {
      const oldName = checkVariant.name;
      checkVariant.name = "checked";
      this.renamePropInTree(ctx.tree, oldName, "checked");
      return "checked";
    }

    const name = "checked";
    ctx.props.push({
      type: "boolean",
      name,
      defaultValue: false,
      required: false,
      sourceKey: "",
    });
    return name;
  }

  private renamePropInTree(node: InternalNode, oldName: string, newName: string): void {
    // visibleCondition
    if (node.visibleCondition) {
      this.renamePropInCondition(node.visibleCondition, oldName, newName);
    }
    // dynamic styles
    if (node.styles?.dynamic) {
      for (const entry of node.styles.dynamic) {
        this.renamePropInCondition(entry.condition, oldName, newName);
      }
    }
    for (const child of node.children || []) {
      this.renamePropInTree(child, oldName, newName);
    }
  }

  private renamePropInCondition(cond: ConditionNode, oldName: string, newName: string): void {
    if ("prop" in cond && cond.prop === oldName) {
      cond.prop = newName;
    }
    if (cond.type === "and" && cond.conditions) {
      for (const c of cond.conditions) {
        this.renamePropInCondition(c, oldName, newName);
      }
    }
    if (cond.type === "not" && (cond as any).condition) {
      this.renamePropInCondition((cond as any).condition, oldName, newName);
    }
  }

  private addOnChangeProp(ctx: HeuristicContext): string {
    const name = "onChange";
    if (!ctx.props.some((p) => p.name === name)) {
      ctx.props.push({
        type: "function",
        name,
        defaultValue: undefined,
        required: false,
        sourceKey: "",
        functionSignature: "(checked: boolean) => void",
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
  private fixStateCheckedSizeConflict(ctx: HeuristicContext, statePropName: string | null): void {
    if (!statePropName) return;
    this.traverseForSizeStateConflict(ctx.tree, statePropName);
  }

  private traverseForSizeStateConflict(node: InternalNode, statePropName: string): void {
    if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
      // AND(state=Checked, size=*) 패턴이 있는지 확인
      const hasStateAndSize = node.styles.dynamic.some((entry) => {
        if (entry.condition.type !== "and") return false;
        const conds = entry.condition.conditions;
        const hasState = conds.some((c) => c.type === "eq" && isStateProp(c.prop));
        const hasSize = conds.some((c) => c.type === "eq" && c.prop === "size");
        return hasState && hasSize;
      });

      if (hasStateAndSize) {
        for (const entry of node.styles.dynamic) {
          if (entry.condition.type !== "and") continue;
          const conds = entry.condition.conditions;
          const stateEq = conds.find((c) => c.type === "eq" && isStateProp(c.prop));
          const sizeEq = conds.find((c) => c.type === "eq" && c.prop === "size");
          if (stateEq && sizeEq) {
            delete entry.style["width"];
            delete entry.style["height"];
          }
        }
      }
    }

    for (const child of node.children || []) {
      this.traverseForSizeStateConflict(child, statePropName);
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

  /**
   * 트리 내 TEXT 노드를 찾아 text?: string prop으로 바인딩
   */
  private addTextProp(ctx: HeuristicContext): void {
    const textNode = this.findTextNode(ctx.tree);
    if (!textNode) return;
    if (ctx.props.some((p) => p.name === "text")) return;

    ctx.props.push({
      type: "string",
      name: "text",
      defaultValue: textNode.text || textNode.name || "",
      required: false,
      sourceKey: "",
    });

    textNode.bindings = {
      ...textNode.bindings,
      content: { prop: "text" },
    };
  }

  private findTextNode(node: InternalNode): InternalNode | null {
    if (node.type === "TEXT") return node;
    for (const child of node.children || []) {
      const found = this.findTextNode(child);
      if (found) return found;
    }
    return null;
  }

  /**
   * slot binding이 있는 아이콘 INSTANCE를 인라인 렌더링으로 변환
   * - dot 아이콘 → checked 기반 visibleCondition
   * - interaction 슬롯 → 제거 (내부 처리)
   */
  private convertIconSlots(ctx: HeuristicContext): void {
    this.convertSlotBindingsRecursive(ctx.tree, ctx);
  }

  private convertSlotBindingsRecursive(node: InternalNode, ctx: HeuristicContext): void {
    if (node.type === "INSTANCE") {
      if (node.bindings?.content && "prop" in node.bindings.content) {
        const slotPropName = node.bindings.content.prop;

        // dot 아이콘 → checked 조건부 렌더링
        const boolProp = this.resolveBooleanProp(node.name);
        if (boolProp) {
          delete node.bindings.content;
          if (Object.keys(node.bindings).length === 0) {
            delete (node as any).bindings;
          }
          node.visibleCondition = { type: "truthy", prop: boolProp };

          const propIndex = ctx.props.findIndex((p) => p.name === slotPropName);
          if (propIndex !== -1) ctx.props.splice(propIndex, 1);
          return;
        }

        // interactionNormal 같은 내부 slot 제거
        if (/interaction/i.test(slotPropName)) {
          delete node.bindings.content;
          if (Object.keys(node.bindings).length === 0) {
            delete (node as any).bindings;
          }
          const propIndex = ctx.props.findIndex((p) => p.name === slotPropName);
          if (propIndex !== -1) ctx.props.splice(propIndex, 1);
          return;
        }
      }
    }

    for (const child of node.children || []) {
      this.convertSlotBindingsRecursive(child, ctx);
    }
  }

  /**
   * 노드 이름으로 boolean prop 이름 추론
   * - "dot" 포함 → "checked"
   */
  private resolveBooleanProp(nodeName: string): "checked" | null {
    const lower = nodeName.toLowerCase().replace(/\s+/g, "");
    if (/dot/.test(lower)) return "checked";
    return null;
  }
}
