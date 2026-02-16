/**
 * Style Processor
 *
 * 스타일 분류 및 Position 처리를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - StyleClassifier: variant 스타일을 base/dynamic/pseudo로 분류
 * - PositionStyler: absolute positioning 스타일 계산
 */

import type { StyleDefinition, PreparedDesignData, PropStyleGroup, PropDefinition } from "@code-generator/types/architecture";
import type { ConditionNode } from "@code-generator/types/customType";
import type {
  IStyleClassifier,
  IPositionStyler,
  VariantStyle,
  MergedNodeWithVariant,
  PositionResult,
  PositionableNode,
  InternalNode,
  BuildContext,
} from "./interfaces";
import { VisibilityProcessor } from "./VisibilityProcessor";
import { traverseTree } from "./utils/treeUtils";
import { stateToPseudo } from "./utils/stateUtils";

// ============================================================================
// Types
// ============================================================================

/**
 * MergedNode 정보를 스타일 빌드에 사용하기 위한 입력 타입
 */
export interface StyleBuildInput {
  mergedNodes: MergedNodeWithVariant[];
  data: PreparedDesignData;
}

// PositionableNode is imported from ./interfaces

// ============================================================================
// StyleProcessor Class
// ============================================================================

/**
 * 스타일 처리 통합 클래스
 *
 * StyleClassifier와 PositionStyler 기능을 통합
 */
export class StyleProcessor implements IStyleClassifier, IPositionStyler {
  // ==========================================================================
  // Static Pipeline Methods
  // ==========================================================================

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

  /**
   * 각 노드의 스타일을 StyleDefinition으로 빌드
   *
   * mergedNode의 variant별 CSS 스타일을 분석하여 base/dynamic/pseudo로 분류합니다.
   *
   * 분류 기준:
   * - base: 모든 variant에서 동일한 스타일
   * - dynamic: Size, Color 등 prop에 따라 달라지는 스타일
   * - pseudo: State prop에 따른 :hover, :active 등 pseudo-class 스타일
   *
   * 특수 처리:
   * - VECTOR/LINE 등 SVG 노드: SVG 전용 속성 제거, overflow: visible 추가
   * - LINE height: 0 노드: display: none 처리
   * - flatten된 FRAME의 HORIZONTAL layoutMode 상속
   *
   * @returns nodeStyles Map이 설정된 BuildContext
   */
  static build(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("StyleProcessor.build: internalTree is required.");
    }

    const instance = new StyleProcessor();
    const nodeStyles = new Map<string, StyleDefinition>();
    const excludeProps = ctx.excludePropsFromStyles || new Set<string>();

    traverseTree(ctx.internalTree, (node) => {
      // excludeProps를 사용하여 조건 파싱
      const parseCondition = (variantName: string) =>
        VisibilityProcessor.parseVariantConditionExcluding(variantName, excludeProps);

      const styles = instance.buildFromMergedNodes(
        { mergedNodes: node.mergedNode, data: ctx.data },
        parseCondition
      );

      // VECTOR/LINE 등 SVG 노드 처리
      if (StyleProcessor.VECTOR_TYPES.has(node.type)) {
        // SVG 전용 속성 제거 및 overflow: visible 추가
        const filteredBase: Record<string, string | number> = { overflow: "visible" };
        for (const [key, value] of Object.entries(styles.base || {})) {
          if (!StyleProcessor.SVG_ONLY_PROPERTIES.has(key)) {
            filteredBase[key] = value;
          }
        }
        styles.base = filteredBase;

        // LINE 노드의 height: 0 처리
        // Figma에서 height: 0인 LINE은 시각적으로 보이지 않는 레이아웃 제약 요소
        // display: none으로 처리하여 flex 레이아웃에서 공간을 차지하지 않도록 함
        if (node.type === "LINE" && node.mergedNode.length > 0) {
          const originalNode = ctx.data.getNodeById(node.mergedNode[0].id);
          if (originalNode?.absoluteBoundingBox?.height === 0) {
            styles.base.display = "none";
          }
        }
      }

      // flatten된 FRAME의 layoutMode 상속 처리
      // 일부 variant에만 존재하던 HORIZONTAL FRAME이 flatten되면, 부모에 flex-direction: row 적용
      if (node.inheritedLayoutMode === "HORIZONTAL") {
        styles.base = {
          ...styles.base,
          "flex-direction": "row",
        };
        // VERTICAL이 있으면 제거
        if (styles.base["flex-direction"] === "column") {
          styles.base["flex-direction"] = "row";
        }
      }

      nodeStyles.set(node.id, styles);
    });

    return { ...ctx, nodeStyles };
  }

  /**
   * auto-layout이 아닌 부모의 자식에게 absolute position 스타일 적용
   *
   * Figma에서 auto-layout이 아닌 FRAME/GROUP의 자식들은
   * 절대 좌표로 배치되므로 position: absolute를 적용합니다.
   *
   * 2-pass 처리:
   * 1. 자식 노드에 position: absolute, left, top 적용
   * 2. absolute 자식을 가진 부모에 position: relative 적용
   *
   * @returns nodeStyles가 업데이트된 BuildContext
   */
  static applyPositions(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.nodeStyles) {
      throw new Error("StyleProcessor.applyPositions: internalTree and nodeStyles are required.");
    }

    const instance = new StyleProcessor();
    const nodeStyles = new Map(ctx.nodeStyles);

    // First pass: apply position: absolute to children
    traverseTree(ctx.internalTree, (node) => {
      const currentStyles = nodeStyles.get(node.id);
      if (currentStyles) {
        const updatedStyles = instance.applyToStyleDefinition(node, currentStyles, ctx.data);
        nodeStyles.set(node.id, updatedStyles);
      }
    });

    // Second pass: add position: relative to parents with absolute children
    traverseTree(ctx.internalTree, (node) => {
      const hasAbsoluteChild = node.children.some((child) => {
        const childStyles = nodeStyles.get(child.id);
        return childStyles?.base?.position === "absolute";
      });

      if (hasAbsoluteChild) {
        const currentStyles = nodeStyles.get(node.id);
        if (currentStyles && !currentStyles.base?.position) {
          nodeStyles.set(node.id, {
            ...currentStyles,
            base: {
              ...currentStyles.base,
              position: "relative",
            },
          });
        }
      }
    });

    return { ...ctx, nodeStyles };
  }

  /**
   * 90도 회전된 요소의 스타일 처리
   *
   * Figma에서 90도/270도 회전된 요소는 CSS transform 대신
   * absoluteRenderBounds를 사용하여 실제 렌더링 크기로 변환합니다.
   *
   * 처리 내용:
   * - rotation이 ±90도인 요소 감지
   * - transform 속성 제거
   * - absoluteRenderBounds에서 width/height 재계산
   *
   * @returns nodeStyles가 업데이트된 BuildContext
   */
  static handleRotation(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.nodeStyles) {
      throw new Error("StyleProcessor.handleRotation: internalTree and nodeStyles are required.");
    }

    const instance = new StyleProcessor();
    const nodeStyles = new Map(ctx.nodeStyles);

    traverseTree(ctx.internalTree, (node) => {
      const nodeSpec = ctx.data.getNodeById(node.id);
      const currentStyles = nodeStyles.get(node.id);
      if (nodeSpec && currentStyles) {
        const updatedBase = instance.handleRotatedElement(nodeSpec, currentStyles.base);
        nodeStyles.set(node.id, { ...currentStyles, base: updatedBase });
      }
    });

    return { ...ctx, nodeStyles };
  }

  // ==========================================================================
  // StyleClassifier Methods
  // ==========================================================================

  /**
   * variant 이름에서 State 값 추출
   * 예: "Size=Large, State=Hover" → "Hover"
   */
  public extractStateFromVariantName(variantName: string): string | null {
    const match = variantName.match(/State=(\w+)/i);
    return match ? match[1] : null;
  }

  /**
   * variant 스타일들을 분류하여 StyleDefinition 생성
   */
  public classifyStyles(
    variantStyles: VariantStyle[],
    parseCondition: (variantName: string) => ConditionNode | null
  ): StyleDefinition {
    if (variantStyles.length === 0) {
      return { base: {}, dynamic: [] };
    }

    // 1. 모든 CSS 키 수집
    const allKeys = new Set<string>();
    for (const vs of variantStyles) {
      Object.keys(vs.cssStyle).forEach((key) => allKeys.add(key));
    }

    // 2. base 스타일 추출 (모든 variant에서 동일한 값)
    const base: Record<string, string | number> = {};
    const dynamicKeys: string[] = [];

    for (const key of allKeys) {
      const values = variantStyles.map((vs) => vs.cssStyle[key]);
      const uniqueValues = new Set(values.filter((v) => v !== undefined));

      if (uniqueValues.size === 1 && values.every((v) => v !== undefined)) {
        base[key] = values[0]!;
      } else {
        dynamicKeys.push(key);
      }
    }

    // 3. State별로 variant 그룹화
    const stateGroups = this.groupByState(variantStyles);

    // 4. dynamic 및 pseudo 스타일 분류
    const dynamic: StyleDefinition["dynamic"] = [];
    const pseudo: StyleDefinition["pseudo"] = {};

    // 5. State-specific 스타일 분리 (여러 State가 있는 경우에만)
    const stateSpecificKeys = new Set<string>();
    const nonStateSpecificKeys = new Set<string>();

    if (stateGroups.size > 1) {
      for (const key of dynamicKeys) {
        if (this.isStateSpecific(key, stateGroups)) {
          stateSpecificKeys.add(key);
        } else {
          nonStateSpecificKeys.add(key);
        }
      }

      // State-specific 스타일을 pseudo 또는 base로 분류
      for (const key of stateSpecificKeys) {
        for (const [state, variants] of stateGroups) {
          const value = variants.find((v) => v.cssStyle[key] !== undefined)?.cssStyle[key];
          if (value === undefined) continue;

          const pseudoClass = stateToPseudo(state);
          if (pseudoClass) {
            // Hover, Active, Disabled 등 → pseudo-class
            pseudo[pseudoClass] = pseudo[pseudoClass] || {};
            pseudo[pseudoClass]![key] = value;
          } else {
            // Default/Normal → base 스타일
            base[key] = value;
          }
        }
      }
    } else {
      // State가 1개 이하면 모든 dynamic 키를 non-state-specific으로 처리
      for (const key of dynamicKeys) {
        nonStateSpecificKeys.add(key);
      }
    }

    // 6. Non-state-specific 스타일을 dynamic으로 분류 (기존 로직)
    for (const vs of variantStyles) {
      const dynamicStyle: Record<string, string | number> = {};
      for (const key of nonStateSpecificKeys) {
        if (vs.cssStyle[key] !== undefined) {
          dynamicStyle[key] = vs.cssStyle[key];
        }
      }

      if (Object.keys(dynamicStyle).length === 0) continue;

      const condition = parseCondition(vs.variantName);

      if (condition) {
        // Has non-State conditions (Size, LeftIcon 등) → add to dynamic
        dynamic.push({ condition, style: dynamicStyle });
      }
      // State-only variants with non-state-specific keys는 이미 처리됨
    }

    return {
      base,
      dynamic,
      ...(Object.keys(pseudo).length > 0 ? { pseudo } : {}),
    };
  }

  /**
   * State별로 variant 그룹화
   */
  private groupByState(variantStyles: VariantStyle[]): Map<string, VariantStyle[]> {
    const groups = new Map<string, VariantStyle[]>();
    for (const vs of variantStyles) {
      const state = this.extractStateFromVariantName(vs.variantName) || "Default";
      if (!groups.has(state)) groups.set(state, []);
      groups.get(state)!.push(vs);
    }
    return groups;
  }

  /**
   * 스타일 속성이 State-specific인지 판별
   * State-specific: 같은 State 내에서 모든 Size/Icon 조합이 동일한 값을 가짐
   */
  private isStateSpecific(key: string, stateGroups: Map<string, VariantStyle[]>): boolean {
    // State가 1개 이하면 State-specific 아님
    if (stateGroups.size <= 1) return false;

    // 같은 State 내에서 모든 variant가 동일한 값을 가지면 true
    for (const [, variants] of stateGroups) {
      const values = variants.map((v) => v.cssStyle[key]).filter((v) => v !== undefined);
      // 값이 여러 개이고 서로 다르면 State-specific 아님
      if (values.length > 0 && new Set(values).size > 1) return false;
    }

    // 추가 검증: State마다 다른 값을 가져야 State-specific
    const valuePerState = new Map<string, string | number | undefined>();
    for (const [state, variants] of stateGroups) {
      const value = variants.find((v) => v.cssStyle[key] !== undefined)?.cssStyle[key];
      valuePerState.set(state, value);
    }
    const uniqueStateValues = new Set([...valuePerState.values()].filter((v) => v !== undefined));

    // State별로 최소 2개 이상의 다른 값이 있어야 State-specific
    return uniqueStateValues.size > 1;
  }

  /**
   * 두 스타일 객체의 차이 계산
   */
  public diffStyles(
    baseStyle: Record<string, string>,
    targetStyle: Record<string, string>
  ): Record<string, string> {
    const diff: Record<string, string> = {};
    for (const [key, value] of Object.entries(targetStyle)) {
      if (baseStyle[key] !== value) {
        diff[key] = value;
      }
    }
    return diff;
  }

  /**
   * 여러 스타일에서 공통 스타일 추출
   */
  public extractCommonStyles(styles: Array<Record<string, string>>): Record<string, string> {
    if (styles.length === 0) return {};
    if (styles.length === 1) return { ...styles[0] };

    const common: Record<string, string> = {};
    const firstStyle = styles[0];

    for (const [key, value] of Object.entries(firstStyle)) {
      if (styles.every((s) => s[key] === value)) {
        common[key] = value;
      }
    }

    return common;
  }

  /**
   * MergedNodes에서 VariantStyle 배열을 생성하고 분류
   */
  public buildFromMergedNodes(
    input: StyleBuildInput,
    parseCondition: (variantName: string) => ConditionNode | null
  ): StyleDefinition {
    const variantStyles: VariantStyle[] = [];

    for (const merged of input.mergedNodes || []) {
      if (!merged?.id) continue;

      const styleTree = input.data.getStyleById(merged.id);
      if (styleTree?.cssStyle) {
        variantStyles.push({
          variantName: merged.variantName || merged.name || "",
          cssStyle: styleTree.cssStyle,
        });
      }
    }

    return this.classifyStyles(variantStyles, parseCondition);
  }

  // ==========================================================================
  // PositionStyler Methods
  // ==========================================================================

  /**
   * Auto-layout이 아닌 부모의 자식에게 position 스타일 계산
   */
  public calculatePosition(
    node: PositionableNode,
    parent: PositionableNode | null,
    data: PreparedDesignData
  ): PositionResult | null {
    if (!parent) return null;

    const nodeSpec = data.getNodeById(node.id);
    const parentSpec = data.getNodeById(parent.id);

    if (!nodeSpec || !parentSpec) return null;

    // 부모가 auto-layout이면 position 불필요
    if (this.isAutoLayout(parentSpec)) return null;

    // 부모가 FRAME이나 GROUP인 경우만 처리
    if (parentSpec.type !== "FRAME" && parentSpec.type !== "GROUP") return null;

    const parentBox = parentSpec.absoluteBoundingBox;
    const nodeBox = nodeSpec.absoluteBoundingBox;

    if (!parentBox || !nodeBox) return null;

    const left = Math.round(nodeBox.x - parentBox.x);
    const top = Math.round(nodeBox.y - parentBox.y);

    return {
      position: "absolute",
      left: `${left}px`,
      top: `${top}px`,
    };
  }

  /**
   * 노드가 auto-layout인지 확인
   */
  public isAutoLayout(nodeSpec: SceneNode): boolean {
    if (!nodeSpec) return false;
    const layoutMode = nodeSpec.layoutMode;
    return layoutMode && layoutMode !== "NONE";
  }

  /**
   * Position 스타일을 StyleDefinition에 적용
   */
  public applyToStyleDefinition(
    node: InternalNode,
    styles: StyleDefinition,
    data: PreparedDesignData
  ): StyleDefinition {
    if (!node.parent) return styles;

    const position = this.calculatePosition(
      { id: node.id, type: node.type, name: node.name, children: [], styles },
      { id: node.parent.id, type: node.parent.type, name: node.parent.name, children: [], styles: { base: {} } },
      data
    );

    if (!position) return styles;

    return {
      ...styles,
      base: {
        ...styles.base,
        position: position.position,
        ...(position.left && { left: position.left }),
        ...(position.top && { top: position.top }),
      },
    };
  }

  /**
   * 회전된 요소의 스타일 처리
   */
  public handleRotatedElement(nodeSpec: SceneNode, styles: Record<string, string>): Record<string, string> {
    const rotation = nodeSpec?.rotation;
    if (rotation === undefined || rotation === 0) return styles;

    const absRotation = Math.abs(rotation);
    const isRotated90 =
      Math.abs(absRotation - Math.PI / 2) < 0.01 ||
      Math.abs(absRotation - (3 * Math.PI) / 2) < 0.01;

    if (!isRotated90) return styles;

    const renderBounds = nodeSpec?.absoluteRenderBounds;
    if (!renderBounds || renderBounds.width <= 0 || renderBounds.height <= 0) {
      return styles;
    }

    const newStyles = { ...styles };
    delete newStyles["transform"];
    newStyles["width"] = `${Math.round(renderBounds.width)}px`;
    newStyles["height"] = `${Math.round(renderBounds.height)}px`;

    return newStyles;
  }

  // ==========================================================================
  // Single-Prop Condition Simplification
  // ==========================================================================

  // ==========================================================================
  // Prop-based Style Separation (for EmotionStyleStrategy)
  // ==========================================================================

  /**
   * 복합 조건 스타일을 prop별로 분리하여 propStyles에 저장
   *
   * EmotionStyleStrategy에서 수행하던 분석 로직을 TreeBuilder로 이동:
   * - groupDynamicStylesByProp() 로직
   * - extractBooleanStylesByVariant() 로직
   * - findPropSpecificStyle() 로직
   *
   * 결과는 StyleDefinition.propStyles에 저장되어 EmotionStyleStrategy가
   * 분석 없이 바로 코드 생성에 사용할 수 있습니다.
   */
  static separateByProp(ctx: BuildContext): BuildContext {
    if (!ctx.nodeStyles || !ctx.propsMap) return ctx;

    const newNodeStyles = new Map(ctx.nodeStyles);
    const props = Array.from(ctx.propsMap.values());

    // 각 prop의 기본값 맵 생성
    const propDefaults = new Map<string, string>();
    for (const prop of props) {
      if (prop.defaultValue !== undefined) {
        const name = prop.name.toLowerCase();
        propDefaults.set(name, String(prop.defaultValue));
        // customXxx → xxx 매핑
        if (name.startsWith("custom")) {
          propDefaults.set(name.slice(6), String(prop.defaultValue));
        }
      }
    }

    for (const [nodeId, styles] of ctx.nodeStyles) {
      if (!styles.dynamic || styles.dynamic.length === 0) {
        continue;
      }

      const propStyles = StyleProcessor.analyzePropStyles(
        styles.dynamic,
        styles.base,
        props,
        propDefaults
      );

      if (Object.keys(propStyles).length > 0) {
        newNodeStyles.set(nodeId, {
          ...styles,
          propStyles,
        });
      }
    }

    return { ...ctx, nodeStyles: newNodeStyles };
  }

  /**
   * dynamic 스타일을 prop별로 분석하여 PropStyleGroup 생성
   */
  private static analyzePropStyles(
    dynamic: StyleDefinition["dynamic"],
    base: Record<string, string | number>,
    props: PropDefinition[],
    propDefaults: Map<string, string>
  ): Record<string, PropStyleGroup> {
    const result: Record<string, PropStyleGroup> = {};

    // 1단계: 모든 조건 수집 및 그룹화
    const collected = new Map<string, Map<string, Array<{
      style: Record<string, string | number>;
      conditions: Array<{ propName: string; propValue: string }>;
    }>>>();

    for (const { condition, style } of dynamic) {
      const allConditions = StyleProcessor.extractAllConditionsFromNode(condition);
      if (allConditions.length === 0) continue;

      for (const { propName, propValue } of allConditions) {
        const normalizedPropName = propName.toLowerCase();
        if (!collected.has(normalizedPropName)) {
          collected.set(normalizedPropName, new Map());
        }
        const variants = collected.get(normalizedPropName)!;
        if (!variants.has(propValue)) {
          variants.set(propValue, []);
        }
        variants.get(propValue)!.push({ style, conditions: allConditions });
      }
    }

    // 2단계: Boolean prop 식별 (True/False 키 존재 여부)
    const booleanProps = new Set<string>();
    for (const [propName, variants] of collected.entries()) {
      const keys = Array.from(variants.keys());
      const hasTrueFalse = keys.some(k => k.toLowerCase() === "true") &&
                           keys.some(k => k.toLowerCase() === "false");
      if (hasTrueFalse) {
        booleanProps.add(propName);
      }
    }

    // 3단계: Variant prop 스타일 먼저 추출 (slot에서 제외할 키 수집)
    const variantStyleKeys = new Set<string>();
    for (const [propName, variants] of collected.entries()) {
      const isBooleanProp = booleanProps.has(propName);
      const isSlotProp = props.some(p =>
        p.name.toLowerCase() === propName && p.type === "slot"
      );

      if (!isBooleanProp && !isSlotProp) {
        // Variant prop (Size, Color 등)
        const variantStyles = StyleProcessor.extractVariantPropStyles(
          propName,
          variants,
          propDefaults,
          base
        );
        if (Object.keys(variantStyles).length > 0) {
          result[propName] = { type: "variant", variants: variantStyles };
          // 이 prop이 제어하는 스타일 키 수집
          for (const style of Object.values(variantStyles)) {
            for (const key of Object.keys(style)) {
              variantStyleKeys.add(key);
            }
          }
        }
      }
    }

    // 4단계: Boolean/Slot prop 처리 (variant 스타일 키 제외)
    for (const [propName, variants] of collected.entries()) {
      const isBooleanProp = booleanProps.has(propName);
      const isSlotProp = props.some(p =>
        p.name.toLowerCase() === propName && p.type === "slot"
      );

      // Slot을 boolean보다 우선 (True/False 값이 있어도 type === "slot"이면 slot으로 처리)
      if (isSlotProp) {
        // Slot prop - variant prop이 제어하는 스타일 제외
        const slotVariants: Record<string, Record<string, string | number>> = {};
        for (const [value, entries] of variants) {
          let style: Record<string, string | number>;
          if (entries.length === 1) {
            style = entries[0].style;
          } else {
            style = StyleProcessor.extractCommonFromStyles(
              entries.map(e => e.style)
            );
          }
          // variant prop이 제어하는 키 제외
          const filteredStyle: Record<string, string | number> = {};
          for (const [key, val] of Object.entries(style)) {
            if (!variantStyleKeys.has(key)) {
              filteredStyle[key] = val;
            }
          }
          if (Object.keys(filteredStyle).length > 0) {
            slotVariants[value] = filteredStyle;
          }
        }
        // 빈 슬롯이라도 CSS 변수 참조를 위해 엔트리 생성
        // (모든 스타일이 variant에 의해 제어되어도 빈 CSS가 생성되어야 함)
        if (Object.keys(slotVariants).length > 0) {
          result[propName] = { type: "slot", variants: slotVariants };
        } else {
          // 스타일이 없어도 True/False 엔트리는 생성 (빈 CSS용)
          result[propName] = {
            type: "slot",
            variants: {
              True: {},
              False: {},
            },
          };
        }
      } else if (isBooleanProp) {
        // Boolean prop 분석 (slot이 아닌 경우만)
        const booleanResult = StyleProcessor.analyzeBooleanPropStyles(
          propName,
          dynamic,
          props,
          propDefaults
        );
        if (booleanResult) {
          result[propName] = booleanResult;
        }
      }
      // Variant props는 이미 3단계에서 처리됨
    }

    return result;
  }

  /**
   * Boolean prop 스타일 분석
   * True/False가 다른 variant prop에 의존하는지 확인
   */
  private static analyzeBooleanPropStyles(
    boolPropName: string,
    dynamic: StyleDefinition["dynamic"],
    props: PropDefinition[],
    propDefaults: Map<string, string>
  ): PropStyleGroup | null {
    const variantProps = props.filter(p => p.type === "variant");
    if (variantProps.length === 0) return null;

    const sizeDefault = props.find(p => p.name.toLowerCase() === "size")?.defaultValue?.toString().toLowerCase();

    // Boolean prop의 True/False 스타일을 variant prop별로 수집
    const trueByVariant = new Map<string, Map<string, Record<string, string | number>>>();
    const falseByVariant = new Map<string, Map<string, Record<string, string | number>>>();

    for (const { condition, style } of dynamic) {
      const conditions = StyleProcessor.extractAllConditionsFromNode(condition);
      if (conditions.length === 0) continue;

      const boolCond = conditions.find(c => c.propName.toLowerCase() === boolPropName.toLowerCase());
      if (!boolCond) continue;

      // Size가 기본값이 아니면 스킵
      const sizeCond = conditions.find(c => c.propName.toLowerCase() === "size");
      if (sizeDefault && sizeCond && sizeCond.propValue.toLowerCase() !== sizeDefault) {
        continue;
      }

      // 다른 variant prop별로 스타일 수집
      for (const cond of conditions) {
        const condName = cond.propName.toLowerCase();
        if (condName === boolPropName.toLowerCase() || condName === "size") continue;

        const isVariantProp = variantProps.some(p => p.name.toLowerCase() === condName);
        if (!isVariantProp) continue;

        const targetMap = boolCond.propValue.toLowerCase() === "true" ? trueByVariant : falseByVariant;
        if (!targetMap.has(condName)) {
          targetMap.set(condName, new Map());
        }
        targetMap.get(condName)!.set(cond.propValue, style);
      }
    }

    // 가장 많은 variant를 가진 prop 선택
    let bestProp: string | null = null;
    let bestTrueMap: Map<string, Record<string, string | number>> = new Map();
    let bestFalseMap: Map<string, Record<string, string | number>> = new Map();

    for (const [propName, styles] of trueByVariant) {
      if (styles.size > bestTrueMap.size) {
        bestProp = propName;
        bestTrueMap = styles;
        bestFalseMap = falseByVariant.get(propName) || new Map();
      }
    }

    // 의존성 없으면 단순 boolean 스타일
    if (!bestProp || bestTrueMap.size <= 1) {
      const trueStyles: Record<string, Record<string, string | number>> = {};
      const falseStyles: Record<string, Record<string, string | number>> = {};

      // 단일 True/False 스타일 찾기
      for (const { condition, style } of dynamic) {
        const conditions = StyleProcessor.extractAllConditionsFromNode(condition);
        const boolCond = conditions.find(c => c.propName.toLowerCase() === boolPropName.toLowerCase());
        if (!boolCond) continue;

        // 다른 조건이 기본값인지 확인
        let allDefault = true;
        for (const cond of conditions) {
          if (cond.propName.toLowerCase() === boolPropName.toLowerCase()) continue;
          const defaultVal = propDefaults.get(cond.propName.toLowerCase());
          if (defaultVal && defaultVal.toLowerCase() !== cond.propValue.toLowerCase()) {
            allDefault = false;
            break;
          }
        }

        if (allDefault) {
          if (boolCond.propValue.toLowerCase() === "true") {
            trueStyles["True"] = style;
          } else {
            falseStyles["False"] = style;
          }
        }
      }

      const variants: Record<string, Record<string, string | number>> = {
        ...trueStyles,
        ...falseStyles,
      };

      if (Object.keys(variants).length > 0) {
        return { type: "boolean", variants };
      }
      return null;
    }

    // True 스타일이 모두 같은지 확인 (invariant)
    const trueStyleValues = Array.from(bestTrueMap.values());
    const firstTrueStyle = trueStyleValues[0] || {};
    const trueInvariantStyle: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(firstTrueStyle)) {
      const normalized = StyleProcessor.extractCssVarFallbackValue(value);
      const allTrueSame = trueStyleValues.every(s =>
        StyleProcessor.extractCssVarFallbackValue(s[key] || "") === normalized
      );
      if (allTrueSame) {
        trueInvariantStyle[key] = value;
      }
    }

    // 결과 생성
    const variants: Record<string, Record<string, string | number>> = {};

    // True/False by variant
    for (const [variantValue, style] of bestTrueMap) {
      variants[`True:${variantValue}`] = style;
    }
    for (const [variantValue, style] of bestFalseMap) {
      variants[`False:${variantValue}`] = style;
    }

    return {
      type: "boolean",
      variants,
      dependsOn: bestProp,
      invariantTrue: Object.keys(trueInvariantStyle).length > 0 ? trueInvariantStyle : undefined,
    };
  }

  /**
   * Variant prop 스타일 추출
   */
  private static extractVariantPropStyles(
    propName: string,
    variants: Map<string, Array<{
      style: Record<string, string | number>;
      conditions: Array<{ propName: string; propValue: string }>;
    }>>,
    propDefaults: Map<string, string>,
    base: Record<string, string | number>
  ): Record<string, Record<string, string | number>> {
    const result: Record<string, Record<string, string | number>> = {};

    // 해당 prop의 모든 값에 대한 스타일 수집 (비교용)
    const allVariantsForProp = Array.from(variants.entries()).flatMap(
      ([pv, entries]) => entries.map(e => ({ propValue: pv, ...e }))
    );

    for (const [propValue, styleEntries] of variants.entries()) {
      if (styleEntries.length === 1) {
        result[propValue] = styleEntries[0].style;
      } else {
        // 여러 스타일이 있으면 공통 속성 추출
        const styles = styleEntries.map(e => e.style);
        const commonStyle = StyleProcessor.extractCommonFromStyles(styles);

        if (Object.keys(commonStyle).length > 0) {
          result[propValue] = commonStyle;
        } else {
          // 공통 스타일이 없으면 해당 prop이 변경하는 속성만 추출
          const propSpecificStyle = StyleProcessor.findPropSpecificStyleFromVariants(
            propName,
            propValue,
            allVariantsForProp,
            propDefaults,
            base
          );
          if (propSpecificStyle && Object.keys(propSpecificStyle).length > 0) {
            result[propValue] = propSpecificStyle;
          }
        }
      }
    }

    // 기본 variant의 스타일 추가 (dynamic에 없으므로 base에서 추출)
    const defaultValue = propDefaults.get(propName.toLowerCase());
    if (defaultValue && !result[defaultValue] && Object.keys(result).length > 0) {
      // 다른 variant들이 변경하는 속성들을 찾아서 base에서 추출
      const varyingKeys = new Set<string>();
      for (const variantStyle of Object.values(result)) {
        for (const key of Object.keys(variantStyle)) {
          varyingKeys.add(key);
        }
      }

      // base에서 해당 속성들만 추출
      const defaultStyle: Record<string, string | number> = {};
      for (const key of varyingKeys) {
        if (key in base) {
          defaultStyle[key] = base[key];
        }
      }

      if (Object.keys(defaultStyle).length > 0) {
        result[defaultValue] = defaultStyle;
      }
    }

    return result;
  }

  /**
   * 해당 prop이 실제로 변경하는 스타일 속성만 추출
   */
  private static findPropSpecificStyleFromVariants(
    targetPropName: string,
    targetPropValue: string,
    allVariants: Array<{
      propValue: string;
      style: Record<string, string | number>;
      conditions: Array<{ propName: string; propValue: string }>;
    }>,
    propDefaults: Map<string, string>,
    _base: Record<string, string | number>
  ): Record<string, string | number> | null {
    // 다른 prop들이 기본값인 variant들만 필터
    const defaultVariants: Array<{ propValue: string; style: Record<string, string | number> }> = [];

    for (const entry of allVariants) {
      let allOtherPropsAreDefault = true;

      for (const cond of entry.conditions) {
        const condPropName = cond.propName.toLowerCase();
        if (condPropName === targetPropName.toLowerCase()) continue;

        const defaultValue = propDefaults.get(condPropName);
        if (defaultValue === undefined) continue;

        if (cond.propValue.toLowerCase() !== defaultValue.toLowerCase()) {
          allOtherPropsAreDefault = false;
          break;
        }
      }

      if (allOtherPropsAreDefault) {
        defaultVariants.push({ propValue: entry.propValue, style: entry.style });
      }
    }

    if (defaultVariants.length === 0) return null;

    // 대상 prop 값의 스타일 찾기
    const targetVariant = defaultVariants.find(v => v.propValue === targetPropValue);
    if (!targetVariant) return null;

    // 다른 prop 값들과 비교하여 변하는 속성만 추출
    const result: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(targetVariant.style)) {
      const normalizedValue = StyleProcessor.extractCssVarFallbackValue(value);

      let variesByProp = false;
      for (const other of defaultVariants) {
        if (other.propValue === targetPropValue) continue;

        const otherValue = other.style[key];
        if (otherValue === undefined) {
          variesByProp = true;
          break;
        }

        if (StyleProcessor.extractCssVarFallbackValue(otherValue) !== normalizedValue) {
          variesByProp = true;
          break;
        }
      }

      if (variesByProp) {
        result[key] = value;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * 조건에서 모든 prop-value 쌍 추출
   */
  private static extractAllConditionsFromNode(
    condition: ConditionNode
  ): Array<{ propName: string; propValue: string }> {
    if (!condition) return [];
    const results: Array<{ propName: string; propValue: string }> = [];

    if (condition.type === "BinaryExpression") {
      const binary = condition as any;
      if (
        binary.operator === "===" &&
        binary.left?.type === "MemberExpression" &&
        binary.left.object?.name === "props" &&
        binary.right?.type === "Literal"
      ) {
        const propName = binary.left.property?.name;
        const propValue = binary.right.value;
        if (propName && propValue !== undefined) {
          results.push({
            propName: propName.charAt(0).toLowerCase() + propName.slice(1),
            propValue: String(propValue),
          });
        }
      }
    } else if (condition.type === "LogicalExpression") {
      const logical = condition as any;
      results.push(...StyleProcessor.extractAllConditionsFromNode(logical.left));
      results.push(...StyleProcessor.extractAllConditionsFromNode(logical.right));
    }

    return results;
  }

  /**
   * CSS 변수에서 fallback 값 추출
   */
  private static extractCssVarFallbackValue(value: string | number): string {
    if (typeof value !== "string") return String(value);
    const match = value.match(/^var\([^,]+,\s*(.+)\)$/);
    if (match) return match[1].trim();
    return value;
  }

  /**
   * 복합 조건 스타일을 단일 prop 조건으로 분해
   *
   * 입력: Size=Large && Color=Primary && Disabled=False → { height, background }
   * 출력:
   *   - Size=Large → { height: 56px }
   *   - Color=Primary → { background: #0050FF }
   *   - Disabled=False → {} (base에 포함되거나 default 값이면 생략)
   *
   * 이 메서드는 버튼과 같이 여러 variant prop이 복합 조건으로 스타일을 결정하는
   * 컴포넌트에서 각 prop별로 스타일을 분리하여 EmotionStyleStrategy가
   * 올바른 Record 객체를 생성할 수 있도록 합니다.
   */
  static simplifyToSinglePropConditions(ctx: BuildContext): BuildContext {
    if (!ctx.nodeStyles || !ctx.propsMap) return ctx;

    const newNodeStyles = new Map(ctx.nodeStyles);
    const props = Array.from(ctx.propsMap.values())
      .filter(p => p.type === "variant" || p.type === "boolean");

    for (const [nodeId, styles] of ctx.nodeStyles) {
      if (!styles.dynamic || styles.dynamic.length === 0) continue;

      const simplifiedDynamic = StyleProcessor.extractPropBasedStyles(
        styles.dynamic,
        props,
        styles.base
      );

      newNodeStyles.set(nodeId, {
        ...styles,
        dynamic: simplifiedDynamic,
      });
    }

    return { ...ctx, nodeStyles: newNodeStyles };
  }

  /**
   * 복합 조건 스타일에서 각 prop별 스타일 추출
   *
   * 접근 방식:
   * 1. 각 prop+option에 대해 공통 스타일 추출 (다른 prop에 무관한 스타일)
   * 2. 원본 compound 조건도 함께 반환 (EmotionStyleStrategy에서 처리)
   *
   * EmotionStyleStrategy.groupDynamicStylesByProp()이 각 prop별로 스타일을 그룹화할 때
   * 공통 스타일만 추출하므로, 여기서는 단일 prop 조건으로 분해만 수행.
   */
  private static extractPropBasedStyles(
    dynamic: StyleDefinition["dynamic"],
    props: Array<{ name: string; type: string; defaultValue?: unknown; options?: string[] }>,
    base: Record<string, string | number>
  ): StyleDefinition["dynamic"] {
    const singlePropStyles: StyleDefinition["dynamic"] = [];

    // 각 prop에 대해 처리
    for (const prop of props) {
      const options = (prop as any).options || [];
      const defaultValue = prop.defaultValue;
      const propName = prop.name;

      // 각 option에 대해 스타일 수집
      for (const option of options) {
        // default 값은 base에 포함되므로 건너뛰기
        const isDefault = String(defaultValue).toLowerCase() === String(option).toLowerCase();
        if (isDefault) continue;

        // 해당 prop=option 조건을 포함하는 모든 스타일 수집
        const stylesForOption: Record<string, string | number>[] = [];
        for (const d of dynamic) {
          if (StyleProcessor.conditionMatchesProp(d.condition, propName, option)) {
            stylesForOption.push(d.style);
          }
        }

        if (stylesForOption.length === 0) continue;

        // 수집된 스타일들에서 공통 속성 추출 (다른 prop의 영향 제거)
        const commonStyle = StyleProcessor.extractCommonFromStyles(stylesForOption);

        // base 스타일과 비교하여 차이만 추출
        const diffStyle = StyleProcessor.diffFromBase(commonStyle, base);

        if (Object.keys(diffStyle).length > 0) {
          singlePropStyles.push({
            condition: StyleProcessor.createSinglePropCondition(propName, option),
            style: diffStyle,
          });
        }
      }
    }

    // 원본 compound 조건도 함께 반환 (스타일 중복은 EmotionStyleStrategy에서 처리)
    // 단, 이미 단일 prop으로 추출된 것과 동일한 스타일은 제외
    const compoundWithUniqueStyles: StyleDefinition["dynamic"] = [];
    for (const d of dynamic) {
      // compound 조건인지 확인 (LogicalExpression)
      if (d.condition.type !== "LogicalExpression") continue;
      compoundWithUniqueStyles.push(d);
    }

    return [...singlePropStyles, ...compoundWithUniqueStyles];
  }

  /**
   * 조건이 특정 prop=value를 포함하는지 확인
   *
   * prop 이름 매칭 시 customXxx → xxx 매핑도 처리
   * (PropsProcessor에서 HTML 충돌 속성에 custom prefix 추가)
   */
  private static conditionMatchesProp(
    condition: ConditionNode,
    propName: string,
    propValue: string
  ): boolean {
    if (!condition) return false;

    if (condition.type === "BinaryExpression") {
      const binary = condition as any;
      const condPropName = binary.left?.property?.name?.toLowerCase();
      const condPropValue = String(binary.right?.value);

      // prop 이름 매칭: customDisabled → disabled 등
      const propNameLower = propName.toLowerCase();
      const originalPropName = propNameLower.startsWith("custom")
        ? propNameLower.slice(6)
        : propNameLower;

      const nameMatches = condPropName === propNameLower || condPropName === originalPropName;
      const valueMatches = condPropValue.toLowerCase() === propValue.toLowerCase();

      return nameMatches && valueMatches;
    }

    if (condition.type === "LogicalExpression") {
      const logical = condition as any;
      return (
        StyleProcessor.conditionMatchesProp(logical.left, propName, propValue) ||
        StyleProcessor.conditionMatchesProp(logical.right, propName, propValue)
      );
    }

    return false;
  }

  /**
   * 여러 스타일에서 공통 속성만 추출
   */
  private static extractCommonFromStyles(
    styles: Array<Record<string, string | number>>
  ): Record<string, string | number> {
    if (styles.length === 0) return {};
    if (styles.length === 1) return { ...styles[0] };

    const common: Record<string, string | number> = {};
    const firstStyle = styles[0];

    for (const [key, value] of Object.entries(firstStyle)) {
      if (styles.every((s) => s[key] === value)) {
        common[key] = value;
      }
    }

    return common;
  }

  /**
   * base 스타일과 비교하여 차이만 추출
   */
  private static diffFromBase(
    style: Record<string, string | number>,
    base: Record<string, string | number>
  ): Record<string, string | number> {
    const diff: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(style)) {
      if (base[key] !== value) {
        diff[key] = value;
      }
    }
    return diff;
  }

  /**
   * 단일 prop 조건 생성
   */
  private static createSinglePropCondition(propName: string, propValue: string): ConditionNode {
    return {
      type: "BinaryExpression",
      operator: "===",
      left: {
        type: "MemberExpression",
        object: { name: "props" },
        property: { name: propName },
      },
      right: {
        type: "Literal",
        value: propValue,
      },
    } as ConditionNode;
  }
}

export default StyleProcessor;
