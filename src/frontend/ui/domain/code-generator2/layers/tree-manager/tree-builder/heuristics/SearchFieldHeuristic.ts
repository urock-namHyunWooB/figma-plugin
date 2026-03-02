/**
 * SearchFieldHeuristic
 *
 * 검색 필드(인라인 텍스트 입력) 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: searchfield, searchbar (+20)
 *
 * 추가 기능:
 * - placeholder TEXT 노드 → semanticType: "search-input" (→ <input> 렌더링)
 * - active 조건부 버튼 INSTANCE → semanticType: "searchfield-clear" (→ onClick 추가)
 * - onChange prop 추가: (value: string) => void
 */

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class SearchFieldHeuristic implements IHeuristic {
  readonly name = "SearchFieldHeuristic";
  readonly componentType: ComponentType = "unknown";

  score(ctx: HeuristicContext): number {
    // 이름 패턴: "searchfield" 또는 "searchbar" (+20, SwitchHeuristic의 +10보다 높음)
    if (/search.?field|search.?bar/i.test(ctx.componentName)) return 20;
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    // onChange: (value: string) => void 추가 (다른 메서드에서 이름 참조)
    const onChangeName = this.addOnChangeProp(ctx);

    // placeholder TEXT 노드 마킹 (→ <input>으로 렌더링) + onChange 바인딩
    this.markPlaceholderInput(ctx.tree, onChangeName);

    // active 조건 안의 x 버튼 INSTANCE에 onClick 바인딩 추가
    this.markClearButton(ctx.tree, false, onChangeName);

    return {
      componentType: this.componentType,
      // rootNodeType 없음 → 루트는 div(container)로 유지
    };
  }

  /**
   * componentPropertyReferences.characters가 있는 TEXT 노드를 "search-input"으로 마킹
   * → JsxGenerator에서 <span> 대신 <input placeholder={prop}>으로 렌더링
   */
  private markPlaceholderInput(node: InternalNode, onChangeName: string): void {
    if (
      node.type === "TEXT" &&
      node.componentPropertyReferences?.["characters"]
    ) {
      node.semanticType = "search-input";
      node.bindings = { ...node.bindings, attrs: {
        ...node.bindings?.attrs,
        onChange: { expr: `(e) => ${onChangeName}?.(e.target.value)` },
      }};
      return;
    }

    for (const child of node.children || []) {
      this.markPlaceholderInput(child, onChangeName);
    }
  }

  /**
   * active 조건부 블록 안의 INSTANCE에 onClick 바인딩 추가
   */
  private markClearButton(node: InternalNode, insideActive: boolean, onChangeName: string): void {
    const nowInsideActive =
      insideActive || this.isActiveCondition(node.visibleCondition);

    if (nowInsideActive && node.type === "INSTANCE" && !node.semanticType) {
      node.bindings = { ...node.bindings, attrs: {
        ...node.bindings?.attrs,
        onClick: { expr: `() => ${onChangeName}?.("")` },
      }};
      return;
    }

    for (const child of node.children || []) {
      this.markClearButton(child, nowInsideActive, onChangeName);
    }
  }

  private isActiveCondition(condition: unknown): boolean {
    if (!condition || typeof condition !== "object") return false;
    const cond = condition as Record<string, unknown>;
    if (cond["type"] === "truthy" && cond["prop"] === "active") return true;
    if (cond["type"] === "eq" && cond["prop"] === "active") return true;
    return false;
  }

  /**
   * onChange prop 추가 (value: string) => void
   * 이미 있으면 기존 boolean 시그니처를 string으로 교체
   */
  private addOnChangeProp(ctx: HeuristicContext): string {
    const name = "onChange";
    const existingIndex = ctx.props.findIndex((p) => p.name === name);

    const onChangeProp = {
      type: "function" as const,
      name,
      defaultValue: undefined,
      required: false,
      sourceKey: "",
      functionSignature: "(value: string) => void",
    };

    if (existingIndex !== -1) {
      // 기존 onChange 교체 (SwitchHeuristic이 먼저 추가했을 수 있음)
      ctx.props[existingIndex] = onChangeProp;
    } else {
      ctx.props.push(onChangeProp);
    }
    return name;
  }
}
