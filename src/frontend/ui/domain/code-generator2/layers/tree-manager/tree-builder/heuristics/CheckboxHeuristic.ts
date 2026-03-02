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

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import { rewritePropConditions, rewriteStateDynamicStyles } from "./rewritePropConditions";
import { isCheckedProp, isDisableProp } from "./propPatterns";

export class CheckboxHeuristic implements IHeuristic {
  readonly name = "CheckboxHeuristic";
  readonly componentType: ComponentType = "unknown";

  score(ctx: HeuristicContext): number {
    if (/checkbox/i.test(ctx.componentName)) return 20;
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    // Figma에서 추출된 state prop 제거
    const removedProp = this.removeStateProp(ctx);

    // checked, onChange, indeterminate, disable prop 추가
    const checkedName = this.addCheckedProp(ctx);
    const onChangeName = this.addOnChangeProp(ctx);
    this.addIndeterminateProp(ctx);
    const disableName = this.addDisableProp(ctx);

    // 루트에 onClick + disabled 바인딩
    ctx.tree.bindings = { ...ctx.tree.bindings, attrs: {
      ...ctx.tree.bindings?.attrs,
      onClick: { expr: `() => ${onChangeName}?.(!${checkedName})` },
      disabled: { prop: disableName },
    }};

    // check/indeterminate 아이콘 slot → boolean prop 조건부 렌더링으로 변환
    this.convertIconSlots(ctx);

    // 제거된 prop이 있으면 트리 전체의 조건 참조를 boolean prop으로 치환
    if (removedProp) {
      const stateValueMap = {
        Checked: "checked",
        Indeterminate: "indeterminate",
      };
      rewritePropConditions(ctx.tree, removedProp, stateValueMap);
      rewriteStateDynamicStyles(ctx.tree, removedProp, stateValueMap);
    }

    return {
      componentType: this.componentType,
      rootNodeType: "button",
    };
  }

  /**
   * Figma에서 추출된 state prop 제거
   * @returns 제거된 prop 이름 (없으면 null)
   */
  private removeStateProp(ctx: HeuristicContext): string | null {
    const idx = ctx.props.findIndex((p) => p.name === "state");
    if (idx === -1) return null;
    const removed = ctx.props[idx].name;
    ctx.props.splice(idx, 1);
    return removed;
  }

  private addCheckedProp(ctx: HeuristicContext): string {
    const existing = ctx.props.find((p) => isCheckedProp(p.name));
    if (existing) return existing.name;

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

  private addIndeterminateProp(ctx: HeuristicContext): void {
    if (ctx.props.some((p) => p.name === "indeterminate")) return;
    ctx.props.push({
      type: "boolean",
      name: "indeterminate",
      defaultValue: false,
      required: false,
      sourceKey: "",
    });
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
        const boolProp = this.resolveBooleanProp(node.name);

        if (boolProp) {
          // slot binding 제거 → inline 컴포넌트로 렌더링
          delete node.bindings.content;
          if (Object.keys(node.bindings).length === 0) {
            delete (node as any).bindings;
          }

          // boolean prop 기반 visibleCondition 설정
          node.visibleCondition = { type: "truthy", prop: boolProp };

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
   * 노드 이름으로 boolean prop 이름 추론
   * - "check"가 포함되고 "checkbox"가 아닌 경우 → "checked"
   * - "lineHorizontal" 또는 "indeterminate" 포함 → "indeterminate"
   */
  private resolveBooleanProp(nodeName: string): "checked" | "indeterminate" | null {
    const lower = nodeName.toLowerCase().replace(/\s+/g, "");
    if (/check(?!box)/.test(lower)) return "checked";
    if (/linehorizontal|indeterminate/.test(lower)) return "indeterminate";
    return null;
  }

}
