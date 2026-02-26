/**
 * SegmentedControlHeuristic
 *
 * Segmented Control 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: segmented, control, tab (+10)
 * 2. 여러 개의 Tab/Item boolean props (+10)
 * 3. 선택 상태를 나타내는 variant가 있음
 *
 * 변환 작업:
 * - Tab boolean props → options 배열로 변환
 * - onChange prop 추가: (label: string) => void
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
    // Container 노드를 찾아서 loop 설정
    const containerNode = ctx.tree.children.find((c) => c.name.toLowerCase().includes("container"));
    const loopTarget = containerNode || ctx.tree;

    loopTarget.loop = { dataProp: "options", keyField: "value" };

    // 템플릿 구조 생성 (첫 번째 Tab을 기반으로)
    this.buildTemplateStructure(loopTarget);

    // Tab boolean props 제거 및 options prop 추가
    this.transformTabPropsToOptions(ctx);

    // onChange prop 추가
    this.addOnChangeProp(ctx);

    // selectedValue prop 추가
    this.addSelectedValueProp(ctx);

    return {
      componentType: this.componentType,
    };
  }

  /**
   * Loop 템플릿 구조 생성
   *
   * 첫 번째 Tab의 스타일을 유지하면서 템플릿 children 생성
   * - onClick 바인딩: onChange 호출
   * - icon 바인딩: item.icon 조건부 렌더링
   * - label 바인딩: item.label 텍스트
   */
  private buildTemplateStructure(containerNode: InternalNode): void {
    if (!containerNode.children || containerNode.children.length === 0) return;

    // 첫 번째 Tab의 스타일 보존
    const firstTab = containerNode.children[0];
    const tabStyles = firstTab.styles;

    // 기존 children을 템플릿 하나로 교체
    // Icon wrapper
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

    // Label text
    const labelText: InternalNode = {
      id: `${firstTab.id}_label`,
      name: "Label",
      type: "TEXT",
      children: [],
      bindings: {
        content: { ref: "item.label" },
      },
    };

    // Content wrapper (icon + label 포함)
    const contentWrapper: InternalNode = {
      id: `${firstTab.id}_content`,
      name: "Content",
      type: "FRAME",
      children: [iconWrapper, labelText],
    };

    // 템플릿 (첫 번째 Tab 대체)
    const template: InternalNode = {
      id: firstTab.id,
      name: firstTab.name,
      type: "FRAME", // INSTANCE가 아닌 FRAME으로 변경 (children 유지를 위해)
      children: [contentWrapper],
      styles: tabStyles,
      bindings: {
        attrs: {
          onClick: { ref: "item.onClick" },
        },
      },
    };

    // Container의 children을 템플릿 하나로 교체
    containerNode.children = [template];
  }

  /**
   * Tab boolean props를 options 배열 prop으로 변환
   */
  private transformTabPropsToOptions(ctx: HeuristicContext): void {
    // ctx.props에서 tab/icon slot props 찾기 (인덱스 수집)
    const tabPropIndices: number[] = [];
    ctx.props.forEach((prop, index) => {
      const nameLower = prop.name.toLowerCase();
      if (
        (prop.type === "slot" || prop.type === "boolean") &&
        (nameLower.startsWith("tab") ||
         nameLower.startsWith("item") ||
         nameLower === "icon")  // SegmentedControl의 icon variant도 제거
      ) {
        tabPropIndices.push(index);
      }
    });

    if (tabPropIndices.length === 0) return;

    // Tab props를 ctx.props에서 제거 (뒤에서부터 제거하여 인덱스 유지)
    // IMPORTANT: splice로 제거하여 원본 배열 참조 유지 (filter는 새 배열 생성)
    for (let i = tabPropIndices.length - 1; i >= 0; i--) {
      ctx.props.splice(tabPropIndices[i], 1);
    }

    // options prop 추가
    ctx.props.push({
      type: "function", // 특수 타입으로 표시 (실제로는 배열이지만 커스텀 타입)
      name: "options",
      defaultValue: undefined,
      required: false,
      sourceKey: "", // 휴리스틱이 추가한 prop
      functionSignature: "Array<{ label: string; value: string; icon?: React.ReactNode }>",
    });
  }

  /**
   * onChange prop 추가
   */
  private addOnChangeProp(ctx: HeuristicContext): void {
    // 이미 onChange prop이 있으면 추가하지 않음
    const hasOnChange = ctx.props.some((p) => p.name === "onChange");
    if (hasOnChange) return;

    // onChange prop 추가 (value를 전달)
    ctx.props.push({
      type: "function",
      name: "onChange",
      defaultValue: undefined,
      required: false,
      sourceKey: "",
      functionSignature: "(value: string) => void",
    });
  }

  /**
   * selectedValue prop 추가
   */
  private addSelectedValueProp(ctx: HeuristicContext): void {
    // 이미 selectedValue prop이 있으면 추가하지 않음
    const hasSelectedValue = ctx.props.some((p) => p.name === "selectedValue");
    if (hasSelectedValue) return;

    // selectedValue prop 추가
    ctx.props.push({
      type: "string",
      name: "selectedValue",
      defaultValue: undefined,
      required: false,
      sourceKey: "",
    });
  }
}
