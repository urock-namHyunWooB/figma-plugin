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
   */
  public applyStyles(node: InternalNode): InternalNode {
    // 스타일 객체 생성
    const styles = this.createStyleObject(node);

    // children 재귀 처리
    const styledChildren = node.children.map((child) =>
      this.applyStyles(child)
    );

    return {
      ...node,
      styles,
      children: styledChildren,
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
    return key
      .split(/\s+/)
      .map((word, index) => {
        if (index === 0) {
          return word.charAt(0).toLowerCase() + word.slice(1);
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join("");
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
