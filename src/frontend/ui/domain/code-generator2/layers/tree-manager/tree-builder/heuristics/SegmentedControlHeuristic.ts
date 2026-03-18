/**
 * SegmentedControlHeuristic
 *
 * Segmented Control 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: segmented, control, tab (+10)
 * 2. 여러 개의 Tab/Item boolean props (+10)
 *
 * 지원 패턴:
 * A. Tab boolean props 패턴 — 각 탭이 개별 boolean prop으로 제어
 * B. 반복 INSTANCE 패턴 — 여러 INSTANCE 자식이 같은 구조를 반복
 *
 * 변환 작업:
 * - options 배열 prop 추가 (기본값 [])
 * - selectedValue, onChange prop 추가
 * - 첫 번째 자식을 템플릿으로 loop 렌더링
 */

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class SegmentedControlHeuristic implements IHeuristic {
  readonly name = "SegmentedControlHeuristic";
  readonly componentType: ComponentType = "custom";

  // ===========================================================================
  // Score 계산
  // ===========================================================================

  score(ctx: HeuristicContext): number {
    let score = 0;

    // 1. 이름 패턴 매칭 (+10)
    score += this.scoreByName(ctx.componentName);

    // 2. Tab/Item boolean props 매칭 (+10)
    score += this.scoreByTabProps(ctx.propDefs);

    return score;
  }

  /**
   * 이름 패턴 점수
   */
  private scoreByName(name: string): number {
    const lowerName = name.toLowerCase();

    // 정확한 매칭
    if (/segmented.*control/i.test(lowerName)) return 10;
    if (/segment/i.test(lowerName)) return 8;
    if (/tab.*control/i.test(lowerName)) return 8;

    return 0;
  }

  /**
   * Tab boolean props 점수
   */
  private scoreByTabProps(
    propDefs:
      | Record<string, { type?: string; defaultValue?: any }>
      | undefined
  ): number {
    if (!propDefs) return 0;

    // Tab/Item으로 시작하는 boolean props 개수 세기
    const tabProps = Object.entries(propDefs).filter(([key, def]) => {
      const keyLower = key.toLowerCase();
      return (
        def.type === "BOOLEAN" &&
        (keyLower.startsWith("tab") || keyLower.startsWith("item"))
      );
    });

    // 2개 이상의 Tab props가 있으면 Segmented Control로 판단
    if (tabProps.length >= 2) {
      return 10;
    }

    return 0;
  }

  // ===========================================================================
  // Apply
  // ===========================================================================

  apply(ctx: HeuristicContext): HeuristicResult {
    const loopTarget = this.findLoopTarget(ctx.tree);

    // 패턴 감지: Tab boolean props vs 반복 INSTANCE 자식
    const hasTabBooleanProps = this.hasTabBooleanProps(ctx);

    if (hasTabBooleanProps) {
      this.applyTabBooleanPattern(ctx, loopTarget);
    } else {
      this.applyRepeatedInstancePattern(ctx, loopTarget);
    }

    return {
      componentType: this.componentType,
    };
  }

  /**
   * loop를 설정할 대상 노드 찾기
   */
  private findLoopTarget(tree: InternalNode): InternalNode {
    const containerNode = tree.children?.find((c) =>
      c.name.toLowerCase().includes("container")
    );
    return containerNode || tree;
  }

  /**
   * Tab boolean props가 있는지 확인
   */
  private hasTabBooleanProps(ctx: HeuristicContext): boolean {
    return ctx.props.some((p) => {
      const nameLower = p.name.toLowerCase();
      return (
        (p.type === "slot" || p.type === "boolean") &&
        (nameLower.startsWith("tab") || nameLower.startsWith("item"))
      );
    });
  }

  // ===========================================================================
  // 패턴 A: Tab boolean props
  // ===========================================================================

  private applyTabBooleanPattern(
    ctx: HeuristicContext,
    loopTarget: InternalNode
  ): void {
    loopTarget.loop = { dataProp: "options", keyField: "value" };

    this.removeTabBooleanProps(ctx);
    this.addOptionsArrayProp(ctx);
    const onChangeName = this.addOnChangeProp(ctx);
    this.buildHardcodedTemplate(loopTarget, onChangeName);
    this.addSelectedValueProp(ctx);
  }

  /**
   * Tab boolean props 제거
   */
  private removeTabBooleanProps(ctx: HeuristicContext): void {
    const tabPropIndices: number[] = [];
    ctx.props.forEach((prop, index) => {
      const nameLower = prop.name.toLowerCase();
      if (
        (prop.type === "slot" || prop.type === "boolean") &&
        (nameLower.startsWith("tab") ||
          nameLower.startsWith("item") ||
          nameLower === "icon")
      ) {
        tabPropIndices.push(index);
      }
    });

    for (let i = tabPropIndices.length - 1; i >= 0; i--) {
      ctx.props.splice(tabPropIndices[i], 1);
    }
  }

  /**
   * 하드코딩 템플릿 (Tab boolean 패턴용, 기존 로직 유지)
   */
  private buildHardcodedTemplate(
    containerNode: InternalNode,
    onChangeName: string
  ): void {
    if (!containerNode.children || containerNode.children.length === 0) return;

    const firstTab = containerNode.children[0];
    const tabStyles = firstTab.styles;

    const iconWrapper: InternalNode = {
      id: `${firstTab.id}_icon_wrapper`,
      name: "IconWrapper",
      type: "FRAME",
      children: [],
      bindings: {
        content: { ref: "item.icon" },
      },
      visibleCondition: {
        type: "truthy",
        prop: "item.icon",
      },
    };

    const labelText: InternalNode = {
      id: `${firstTab.id}_label`,
      name: "Label",
      type: "TEXT",
      children: [],
      bindings: {
        content: { ref: "item.label" },
      },
    };

    const contentWrapper: InternalNode = {
      id: `${firstTab.id}_content`,
      name: "Content",
      type: "FRAME",
      children: [iconWrapper, labelText],
    };

    const template: InternalNode = {
      id: firstTab.id,
      name: firstTab.name,
      type: "FRAME",
      children: [contentWrapper],
      styles: tabStyles,
      bindings: {
        attrs: {
          onClick: { expr: `() => ${onChangeName}?.(item.value)` },
        },
      },
    };

    containerNode.children = [template];
  }

  // ===========================================================================
  // 패턴 B: 반복 INSTANCE 자식
  // ===========================================================================

  private applyRepeatedInstancePattern(
    ctx: HeuristicContext,
    loopTarget: InternalNode
  ): void {
    loopTarget.loop = { dataProp: "options", keyField: "value" };

    // 개수 제어 variant prop 제거 (예: "2 options" / "3 options")
    this.removeCountVariantProp(ctx);

    this.addOptionsArrayProp(ctx);
    const onChangeName = this.addOnChangeProp(ctx);
    this.buildTemplateFromInstance(loopTarget, onChangeName);
    this.addSelectedValueProp(ctx);
  }

  /**
   * 개수 제어 variant prop 찾아서 제거
   *
   * "2 options", "3 options" 처럼 숫자로 시작하는 값을 가진 variant는
   * 자식 개수를 제어하는 prop이므로, 배열 options로 대체 시 제거해야 함
   */
  private removeCountVariantProp(ctx: HeuristicContext): void {
    const idx = ctx.props.findIndex((p) => {
      if (p.type !== "variant" || !("options" in p)) return false;
      const opts = (p as any).options as string[];
      // 모든 값이 숫자로 시작하면 개수 제어 variant
      return opts.length >= 2 && opts.every((v) => /^\d/.test(v));
    });

    if (idx !== -1) {
      ctx.props.splice(idx, 1);
    }
  }

  /**
   * 실제 첫 번째 자식 구조를 보존하면서 템플릿으로 전환
   *
   * - 첫 번째 자식의 스타일과 구조를 그대로 유지
   * - Label TEXT 노드에 item.label 바인딩 추가
   * - onClick 바인딩 추가
   * - INSTANCE → FRAME 변환 (children 렌더링을 위해)
   * - 나머지 자식 제거 (loop가 반복 처리)
   */
  private buildTemplateFromInstance(
    containerNode: InternalNode,
    onChangeName: string
  ): void {
    if (!containerNode.children || containerNode.children.length === 0) return;

    const template = containerNode.children[0];

    // INSTANCE → FRAME 변환 (INSTANCE는 서브컴포넌트로 렌더링되므로)
    if (template.type === "INSTANCE") {
      template.type = "FRAME";
    }

    // onClick 바인딩 추가
    if (!template.bindings) template.bindings = {};
    template.bindings.attrs = {
      ...(template.bindings.attrs || {}),
      onClick: { expr: `() => ${onChangeName}?.(item.value)` },
    };

    // Label TEXT 노드를 찾아서 item.label 바인딩 추가
    this.bindLabelText(template);

    // 자식 중 visibleCondition이 있는 것들의 dynamic styles 제거
    // (개수 variant 조건은 더 이상 필요 없음)
    this.removeVisibleConditions(template);

    // 첫 번째 자식만 템플릿으로 유지
    containerNode.children = [template];
  }

  /**
   * 재귀적으로 TEXT 노드를 찾아서 item.label 바인딩 추가
   */
  private bindLabelText(node: InternalNode): boolean {
    if (node.type === "TEXT") {
      if (!node.bindings) node.bindings = {};
      node.bindings.content = { ref: "item.label" };
      return true;
    }

    for (const child of node.children || []) {
      if (this.bindLabelText(child)) return true;
    }
    return false;
  }

  /**
   * 개수 variant에 의한 visibleCondition 제거 (재귀)
   */
  private removeVisibleConditions(node: InternalNode): void {
    if (node.visibleCondition) {
      delete node.visibleCondition;
    }
    for (const child of node.children || []) {
      this.removeVisibleConditions(child);
    }
  }

  // ===========================================================================
  // 공통 prop 추가
  // ===========================================================================

  /**
   * options 배열 prop 추가
   */
  private addOptionsArrayProp(ctx: HeuristicContext): void {
    ctx.props.push({
      type: "function",
      name: "options",
      defaultValue: [],
      required: false,
      sourceKey: "",
      functionSignature:
        "Array<{ label: string; value: string; icon?: React.ReactNode }>",
    });
  }

  /**
   * onChange prop 추가
   */
  private addOnChangeProp(ctx: HeuristicContext): string {
    const name = "onChange";
    if (!ctx.props.some((p) => p.name === name)) {
      ctx.props.push({
        type: "function",
        name,
        defaultValue: undefined,
        required: false,
        sourceKey: "",
        functionSignature: "(value: string) => void",
      });
    }
    return name;
  }

  /**
   * selectedValue prop 추가
   */
  private addSelectedValueProp(ctx: HeuristicContext): void {
    const hasSelectedValue = ctx.props.some(
      (p) => p.name === "selectedValue"
    );
    if (hasSelectedValue) return;

    ctx.props.push({
      type: "string",
      name: "selectedValue",
      defaultValue: undefined,
      required: false,
      sourceKey: "",
    });
  }
}
