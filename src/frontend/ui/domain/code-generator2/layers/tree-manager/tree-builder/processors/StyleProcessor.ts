import {
  InternalNode,
  StyleObject,
  ConditionNode,
  PseudoClass,
  VariantOrigin,
} from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * StyleProcessor
 *
 * InternalNode의 mergedNodes → StyleObject 변환
 *
 * 병합 전략:
 * 1. 모든 variant 공통 스타일 → base
 * 2. 특정 variant만의 스타일 → dynamic (조건 생성)
 * 3. State prop 기반 스타일 → pseudo
 */
export class StyleProcessor {
  private readonly dataManager: DataManager;

  /** VECTOR 계열 타입 */
  private static readonly VECTOR_TYPES = new Set([
    "VECTOR", "LINE", "ELLIPSE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
  ]);

  /** SVG 전용 속성 (CSS에서 제거해야 함) */
  private static readonly SVG_ONLY_PROPERTIES = new Set([
    "strokeWidth", "stroke-width",
    "strokeLinecap", "stroke-linecap",
    "strokeLinejoin", "stroke-linejoin",
    "strokeMiterlimit", "stroke-miterlimit",
    "strokeDasharray", "stroke-dasharray",
    "strokeDashoffset", "stroke-dashoffset",
    "fillRule", "fill-rule",
    "clipRule", "clip-rule",
  ]);

  /** State prop 값 → CSS pseudo-class 매핑 */
  private readonly STATE_TO_PSEUDO: Record<string, PseudoClass> = {
    Hover: ":hover",
    hover: ":hover",
    Active: ":active",
    active: ":active",
    Pressed: ":active",
    pressed: ":active",
    Focus: ":focus",
    focus: ":focus",
    Disabled: ":disabled",
    disabled: ":disabled",
    disable: ":disabled",
    Checked: ":checked",
    checked: ":checked",
    Visited: ":visited",
    visited: ":visited",
  };

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * InternalNode에 스타일 적용 (재귀)
   *
   * 2단계 처리:
   * 1. variant 기반 스타일 적용
   * 2. position 스타일 적용 (absolute positioning)
   */
  public applyStyles(node: InternalNode): InternalNode {
    // 1단계: variant 기반 스타일 적용
    let result = this.applyVariantStyles(node);

    // 2단계: position 스타일 적용
    result = this.applyPositionStyles(result);

    return result;
  }

  /**
   * variant 기반 스타일 적용 (재귀)
   */
  private applyVariantStyles(node: InternalNode): InternalNode {
    // 스타일 객체 생성
    let styles = this.createStyleObject(node);

    // HORIZONTAL layoutMode 처리: flex-direction: row 명시적 추가
    // (CSS 기본값이므로 styleTree에 포함되지 않는 경우가 있음)
    if (styles && styles.base && styles.base["display"] === "flex") {
      const { node: sceneNode } = this.dataManager.getById(node.id);
      const layoutMode = (sceneNode as any)?.layoutMode;
      if (layoutMode === "HORIZONTAL" && !styles.base["flex-direction"]) {
        styles = {
          ...styles,
          base: { ...styles.base, "flex-direction": "row" },
        };
      }
    }

    // VECTOR 타입 처리: SVG 전용 속성 제거, overflow: visible 추가
    if (styles && StyleProcessor.VECTOR_TYPES.has(node.type)) {
      const filteredBase: Record<string, string | number> = { overflow: "visible" };
      for (const [key, value] of Object.entries(styles.base || {})) {
        if (!StyleProcessor.SVG_ONLY_PROPERTIES.has(key)) {
          filteredBase[key] = value;
        }
      }
      styles = {
        ...styles,
        base: filteredBase,
      };
    }

    // children 재귀 처리
    const styledChildren = node.children.map((child) =>
      this.applyVariantStyles(child)
    );

    return {
      ...node,
      styles,
      children: styledChildren,
    };
  }

  /**
   * position 스타일 적용
   *
   * auto-layout이 아닌 부모의 자식에게 position: absolute 적용
   * 해당 부모에게 position: relative 적용
   */
  private applyPositionStyles(node: InternalNode): InternalNode {
    // 1단계: 자식에게 position: absolute, left, top 적용
    const updatedChildren = node.children.map((child) => {
      // 재귀적으로 먼저 자식의 자식들 처리
      const processedChild = this.applyPositionStyles(child);

      // 부모가 auto-layout이 아니면 position 적용
      if (this.shouldApplyAbsolutePosition(node, processedChild)) {
        const positionStyles = this.calculatePositionStyles(node, processedChild);
        if (positionStyles) {
          return {
            ...processedChild,
            styles: {
              ...processedChild.styles,
              base: {
                ...(processedChild.styles?.base || {}),
                ...positionStyles,
              },
              dynamic: processedChild.styles?.dynamic || [],
            },
          };
        }
      }

      return processedChild;
    });

    // 2단계: absolute 자식이 있으면 부모에 position: relative 적용
    const hasAbsoluteChild = updatedChildren.some(
      (child) => child.styles?.base?.position === "absolute"
    );

    if (hasAbsoluteChild && !node.styles?.base?.position) {
      return {
        ...node,
        styles: {
          ...node.styles,
          base: {
            ...(node.styles?.base || {}),
            position: "relative",
          },
          dynamic: node.styles?.dynamic || [],
        },
        children: updatedChildren,
      };
    }

    return {
      ...node,
      children: updatedChildren,
    };
  }

  /**
   * absolute positioning을 적용해야 하는지 확인
   */
  private shouldApplyAbsolutePosition(
    parent: InternalNode,
    _child: InternalNode
  ): boolean {
    // 부모가 FRAME 또는 GROUP이어야 함
    if (parent.type !== "FRAME" && parent.type !== "GROUP") {
      return false;
    }

    // 부모가 auto-layout이면 적용하지 않음
    if (this.isAutoLayout(parent)) {
      return false;
    }

    return true;
  }

  /**
   * 부모가 auto-layout인지 확인
   */
  private isAutoLayout(node: InternalNode): boolean {
    // DataManager에서 노드 정보 가져오기
    const { node: sceneNode } = this.dataManager.getById(node.id);
    if (!sceneNode) return false;

    const layoutMode = (sceneNode as any).layoutMode;
    return layoutMode && layoutMode !== "NONE";
  }

  /**
   * position 스타일 계산 (left, top)
   */
  private calculatePositionStyles(
    parent: InternalNode,
    child: InternalNode
  ): Record<string, string | number> | null {
    const parentBounds = parent.bounds;
    const childBounds = child.bounds;

    if (!parentBounds || !childBounds) {
      return null;
    }

    const left = Math.round(childBounds.x - parentBounds.x);
    const top = Math.round(childBounds.y - parentBounds.y);

    return {
      position: "absolute",
      left: `${left}px`,
      top: `${top}px`,
    };
  }

  /**
   * mergedNodes → StyleObject 변환
   */
  private createStyleObject(node: InternalNode): StyleObject | undefined {
    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return undefined;
    }

    // 각 variant의 스타일 수집
    const variantStyles = this.collectVariantStyles(node.mergedNodes);
    if (variantStyles.length === 0) {
      return undefined;
    }

    // State 기반 스타일 분리
    const { baseVariants, pseudoVariants } =
      this.separateStateVariants(variantStyles);

    // base 스타일 계산 (모든 base variant 공통)
    const base = this.extractCommonStyles(
      baseVariants.map((v) => v.cssStyle)
    );

    // dynamic 스타일 계산
    const dynamic = this.extractDynamicStyles(baseVariants, base);

    // pseudo 스타일 계산
    const pseudo = this.extractPseudoStyles(pseudoVariants);

    return {
      base,
      dynamic,
      ...(Object.keys(pseudo).length > 0 ? { pseudo } : {}),
    };
  }

  /**
   * mergedNodes의 스타일 수집
   */
  private collectVariantStyles(
    mergedNodes: VariantOrigin[]
  ): Array<{ variantName: string; cssStyle: Record<string, string> }> {
    const result: Array<{
      variantName: string;
      cssStyle: Record<string, string>;
    }> = [];

    for (const merged of mergedNodes) {
      const { style } = this.dataManager.getById(merged.id);
      if (style && Object.keys(style.cssStyle).length > 0) {
        result.push({
          variantName: merged.variantName || merged.name,
          cssStyle: style.cssStyle,
        });
      }
    }

    return result;
  }

  /**
   * State 기반 variant 분리
   */
  private separateStateVariants(
    variantStyles: Array<{ variantName: string; cssStyle: Record<string, string> }>
  ): {
    baseVariants: Array<{ variantName: string; cssStyle: Record<string, string> }>;
    pseudoVariants: Array<{
      variantName: string;
      state: string;
      cssStyle: Record<string, string>;
    }>;
  } {
    const baseVariants: Array<{
      variantName: string;
      cssStyle: Record<string, string>;
    }> = [];
    const pseudoVariants: Array<{
      variantName: string;
      state: string;
      cssStyle: Record<string, string>;
    }> = [];

    for (const variant of variantStyles) {
      const state = this.extractStateFromVariantName(variant.variantName);

      if (state && this.STATE_TO_PSEUDO[state]) {
        pseudoVariants.push({
          ...variant,
          state,
        });
      } else {
        baseVariants.push(variant);
      }
    }

    return { baseVariants, pseudoVariants };
  }

  /**
   * variant 이름에서 State 값 추출
   * "Size=Large, State=Hover, ..." → "Hover"
   */
  private extractStateFromVariantName(variantName: string): string | null {
    const stateMatch = variantName.match(/State=([^,]+)/i);
    if (stateMatch) {
      return stateMatch[1].trim();
    }

    const statesMatch = variantName.match(/states=([^,]+)/i);
    if (statesMatch) {
      return statesMatch[1].trim();
    }

    return null;
  }

  /**
   * 모든 variant에 공통된 스타일 추출
   */
  private extractCommonStyles(
    styles: Array<Record<string, string>>
  ): Record<string, string | number> {
    if (styles.length === 0) return {};
    if (styles.length === 1) return styles[0];

    const common: Record<string, string | number> = {};
    const firstStyle = styles[0];

    for (const [key, value] of Object.entries(firstStyle)) {
      const isCommon = styles.every((style) => style[key] === value);
      if (isCommon) {
        common[key] = value;
      }
    }

    return common;
  }

  /**
   * 조건부 스타일 추출 (base에 없는 스타일)
   */
  private extractDynamicStyles(
    variantStyles: Array<{ variantName: string; cssStyle: Record<string, string> }>,
    base: Record<string, string | number>
  ): Array<{ condition: ConditionNode; style: Record<string, string | number> }> {
    const dynamic: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
    }> = [];

    for (const variant of variantStyles) {
      const uniqueStyles = this.getDifferentStyles(variant.cssStyle, base);

      if (Object.keys(uniqueStyles).length > 0) {
        const condition = this.createConditionFromVariantName(
          variant.variantName
        );
        if (condition) {
          dynamic.push({ condition, style: uniqueStyles });
        }
      }
    }

    return dynamic;
  }

  /**
   * base와 다른 스타일만 추출
   */
  private getDifferentStyles(
    cssStyle: Record<string, string>,
    base: Record<string, string | number>
  ): Record<string, string | number> {
    const result: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(cssStyle)) {
      if (base[key] !== value) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * variant 이름 → 조건 노드 생성
   * "Size=Large, Left Icon=True" → { type: 'and', conditions: [...] }
   */
  private createConditionFromVariantName(
    variantName: string
  ): ConditionNode | null {
    const props = this.parseVariantName(variantName);
    if (props.length === 0) return null;

    const conditions: ConditionNode[] = [];

    for (const { key, value } of props) {
      // State/states는 제외 (pseudo-class로 처리됨)
      if (key.toLowerCase() === "state" || key.toLowerCase() === "states") {
        continue;
      }

      conditions.push(this.createCondition(key, value));
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];

    return { type: "and", conditions };
  }

  /**
   * variant 이름 파싱
   * "Size=Large, Left Icon=True" → [{key: "Size", value: "Large"}, ...]
   */
  private parseVariantName(
    variantName: string
  ): Array<{ key: string; value: string }> {
    const result: Array<{ key: string; value: string }> = [];
    const parts = variantName.split(",");

    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (key && value) {
        result.push({ key, value });
      }
    }

    return result;
  }

  /**
   * prop 조건 노드 생성
   */
  private createCondition(key: string, value: string): ConditionNode {
    // camelCase로 변환
    const propName = this.normalizePropName(key);

    // Boolean 값 처리
    if (value.toLowerCase() === "true") {
      return { type: "truthy", prop: propName };
    }
    if (value.toLowerCase() === "false") {
      return { type: "not", condition: { type: "truthy", prop: propName } };
    }

    // 일반 값
    return { type: "eq", prop: propName, value };
  }

  /**
   * Prop 이름 정규화 (PropsExtractor와 동일한 로직)
   */
  private normalizePropName(key: string): string {
    let propName = key
      .split(/\s+/)
      .map((word, index) => {
        if (index === 0) {
          return word.charAt(0).toLowerCase() + word.slice(1);
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join("");

    // Native HTML prop과 충돌하는 이름은 custom 접두사 추가
    if (this.isNativePropConflict(propName)) {
      propName = "custom" + propName.charAt(0).toUpperCase() + propName.slice(1);
    }

    return propName;
  }

  /**
   * Native HTML prop과 충돌하는 이름인지 확인
   */
  private isNativePropConflict(propName: string): boolean {
    const nativeProps = new Set([
      "type",       // button type
      "name",       // form element name
      "value",      // input value
      "checked",    // checkbox checked
      "disabled",   // disabled state
      "required",   // required attribute
      "placeholder",// input placeholder
      "href",       // anchor href
      "src",        // image src
      "alt",        // image alt
    ]);

    return nativeProps.has(propName);
  }

  /**
   * pseudo-class 스타일 추출
   */
  private extractPseudoStyles(
    pseudoVariants: Array<{
      variantName: string;
      state: string;
      cssStyle: Record<string, string>;
    }>
  ): Partial<Record<PseudoClass, Record<string, string | number>>> {
    const pseudo: Partial<Record<PseudoClass, Record<string, string | number>>> =
      {};

    for (const variant of pseudoVariants) {
      const pseudoClass = this.STATE_TO_PSEUDO[variant.state];
      if (pseudoClass) {
        pseudo[pseudoClass] = variant.cssStyle;
      }
    }

    return pseudo;
  }
}
