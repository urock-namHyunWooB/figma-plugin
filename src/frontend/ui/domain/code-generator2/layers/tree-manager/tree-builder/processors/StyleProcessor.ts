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

  // 모든 비-pseudo State 값은 createConditionFromVariantName에서 조건으로 포함됨.
  // 이전에는 PROP_BASED_STATE_VALUES 화이트리스트로 Checked/Indeterminate만 포함했지만,
  // Unchecked 등 default 값을 제외하면 UITreeOptimizer가 잘못 병합하는 버그 발생.

  /** CSS pseudo-class로 변환 가능한 State 값 (lowercase 비교용) */
  static readonly CSS_CONVERTIBLE_STATES = new Set([
    "default", "normal", "enabled", "rest", "idle",
    "hover", "hovered", "hovering",
    "active", "pressed", "pressing", "clicked",
    "focus", "focused", "focus-visible",
    "disabled", "inactive", "selected", "checked", "visited",
  ]);

  /** State prop 값 → CSS pseudo-class 매핑 (heuristics에서 사용) */
  static readonly STATE_TO_PSEUDO: Record<string, PseudoClass> = {
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
    // 스타일 객체 생성 (synthetic 노드는 기존 styles 유지)
    let styles = this.createStyleObject(node) ?? node.styles;

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
    let correctedBounds: typeof node.bounds | undefined;
    if (styles && StyleProcessor.VECTOR_TYPES.has(node.type)) {
      const filteredBase: Record<string, string | number> = { overflow: "visible" };
      let hasRotate = false;
      for (const [key, value] of Object.entries(styles.base || {})) {
        if (StyleProcessor.SVG_ONLY_PROPERTIES.has(key)) continue;
        // SVG exportAsync는 rotate를 path 좌표에 이미 반영 → CSS rotate 제거 (이중 적용 방지)
        if (key === "transform" && typeof value === "string" && /rotate\(/.test(value)) {
          hasRotate = true;
          const stripped = value.replace(/rotate\([^)]*\)\s*/g, "").trim();
          if (stripped) {
            filteredBase[key] = stripped;
          }
          continue;
        }
        filteredBase[key] = value;
      }

      // rotate 제거 시 width/height를 회전 후 값으로 교체
      // getCSSAsync는 회전 전 치수를 반환하므로, absoluteBoundingBox(회전 후)로 보정
      if (hasRotate && node.bounds) {
        let w = node.bounds.width;
        let h = node.bounds.height;
        let bx = node.bounds.x;
        let by = node.bounds.y;

        // 한 축이 ~0인 경우 (직선 등): absoluteRenderBounds(stroke 포함)로 fallback
        if (w < 1 || h < 1) {
          const { node: sceneNode } = this.dataManager.getById(node.id);
          const renderBounds = (sceneNode as any)?.absoluteRenderBounds;
          if (renderBounds) {
            // bounds.x는 폭≈0일 때 중심점 → renderBounds.x(왼쪽 가장자리)로 교체
            if (w < 1) { w = renderBounds.width; bx = renderBounds.x; }
            if (h < 1) { h = renderBounds.height; by = renderBounds.y; }
          }
        }

        filteredBase["width"] = `${Math.round(w * 1000) / 1000}px`;
        filteredBase["height"] = `${Math.round(h * 1000) / 1000}px`;

        // bounds도 교정 (applyPositionStyles에서 올바른 left/top 계산용)
        correctedBounds = { x: bx, y: by, width: w, height: h };
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
      ...(correctedBounds ? { bounds: correctedBounds } : {}),
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
    // 부모가 FRAME, GROUP, 또는 COMPONENT이어야 함
    if (parent.type !== "FRAME" && parent.type !== "GROUP" && parent.type !== "COMPONENT") {
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

    // 비-pseudo state 값이 2개 이상일 때만 state 조건을 포함
    // (1개면 모두 같은 state → 조건 불필요, 2개 이상이면 UITreeOptimizer 오병합 방지)
    const nonPseudoStateValues = new Set<string>();
    for (const v of baseVariants) {
      const state = this.extractStateFromVariantName(v.variantName);
      if (state) nonPseudoStateValues.add(state);
    }
    const includeStateInConditions = nonPseudoStateValues.size > 1;

    // base 스타일 계산 (모든 base variant 공통)
    const base = this.extractCommonStyles(
      baseVariants.map((v) => v.cssStyle)
    );

    // dynamic 스타일 계산
    const dynamic = this.extractDynamicStyles(baseVariants, base, includeStateInConditions);

    // pseudo variant → state 조건 dynamic 엔트리로 변환
    // 각 pseudo-class에 해당하는 모든 variant의 "공통 diff" (base 대비)만 추출.
    // customType/size 등으로 달라지는 속성은 제외 → 순수 state-varying CSS만 포함.
    const stateDynamic = this.extractStateDynamicEntries(pseudoVariants, base);
    dynamic.push(...stateDynamic);

    return {
      base,
      dynamic,
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
      const { node, style } = this.dataManager.getById(merged.id);
      if (style && Object.keys(style.cssStyle).length > 0) {
        const cssStyle = { ...style.cssStyle };

        // getCSSAsync가 flex cross-axis "HUG" 치수를 누락하는 경우 bbox에서 보충
        // 단, flex main axis(column→height, row→width)는 자식이 결정하므로 보충하지 않음
        const bbox = (node as any)?.absoluteBoundingBox;
        if (bbox && !cssStyle.flex) {
          const isFlex = cssStyle.display?.includes("flex");
          const isColumn = cssStyle["flex-direction"] === "column";
          if (cssStyle.height && !cssStyle.width && !(isFlex && !isColumn)) {
            cssStyle.width = `${Math.round(bbox.width)}px`;
          }
          if (cssStyle.width && !cssStyle.height && !(isFlex && isColumn)) {
            cssStyle.height = `${Math.round(bbox.height)}px`;
          }
        }

        result.push({
          variantName: merged.variantName || merged.name,
          cssStyle,
        });
      }
    }

    return result;
  }

  /**
   * State 기반 variant 분리
   *
   * STATE_TO_PSEUDO에 매칭되는 state variant를 분리한다.
   * 분리된 variant는 base/dynamic 계산에서 제외되어 스타일 왜곡 방지.
   * pseudo-class 생성 여부는 heuristic이 결정한다.
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

      if (state && StyleProcessor.STATE_TO_PSEUDO[state]) {
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
    base: Record<string, string | number>,
    includeStateInConditions: boolean = false
  ): Array<{ condition: ConditionNode; style: Record<string, string | number> }> {
    const dynamic: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
    }> = [];

    for (const variant of variantStyles) {
      const uniqueStyles = this.getDifferentStyles(variant.cssStyle, base);

      if (Object.keys(uniqueStyles).length > 0) {
        const condition = this.createConditionFromVariantName(
          variant.variantName,
          includeStateInConditions
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
    variantName: string,
    includeStateInConditions: boolean = false
  ): ConditionNode | null {
    const props = this.parseVariantName(variantName);
    if (props.length === 0) return null;

    const conditions: ConditionNode[] = [];

    for (const { key, value } of props) {
      if (key.toLowerCase() === "state" || key.toLowerCase() === "states") {
        // state 값은 2개 이상일 때만 조건에 포함
        // (1개면 조건 불필요, 2개 이상이면 UITreeOptimizer 오병합 방지)
        // state→pseudo 변환은 heuristic이 결정한다.
        if (includeStateInConditions) {
          conditions.push(this.createCondition(key, value));
        }
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
   * pseudo variant → state 조건 dynamic 엔트리 변환
   *
   * 같은 state 값을 가진 모든 variant의 스타일에서:
   * 1. base와의 diff 계산
   * 2. 모든 variant에 공통인 diff만 추출 (customType/size로 달라지는 속성 제외)
   * 3. state 조건 (eq(states, "hover") 등) dynamic 엔트리 생성
   */
  private extractStateDynamicEntries(
    pseudoVariants: Array<{
      variantName: string;
      state: string;
      cssStyle: Record<string, string>;
    }>,
    base: Record<string, string | number>
  ): Array<{ condition: ConditionNode; style: Record<string, string | number> }> {
    // state 값별 그룹핑
    const stateGroups = new Map<string, Array<Record<string, string>>>();
    const stateKeys = new Map<string, string>(); // state value → prop key (State or states)

    for (const variant of pseudoVariants) {
      if (!stateGroups.has(variant.state)) {
        stateGroups.set(variant.state, []);
      }
      stateGroups.get(variant.state)!.push(variant.cssStyle);

      // state prop key 추출 (State= or states=)
      if (!stateKeys.has(variant.state)) {
        const match = variant.variantName.match(/(State|states)\s*=/i);
        if (match) stateKeys.set(variant.state, match[1]);
      }
    }

    const result: Array<{ condition: ConditionNode; style: Record<string, string | number> }> = [];

    for (const [stateValue, variants] of stateGroups) {
      // 각 variant의 base 대비 diff
      const diffs = variants.map((css) => this.getDifferentStyles(css, base));

      // 모든 variant에 공통인 diff만 추출
      const commonDiff = this.extractCommonStyles(
        diffs as Array<Record<string, string>>
      );

      if (Object.keys(commonDiff).length === 0) continue;

      const propKey = stateKeys.get(stateValue) || "states";
      const condition = this.createCondition(propKey, stateValue);

      result.push({ condition, style: commonDiff });
    }

    return result;
  }
}
