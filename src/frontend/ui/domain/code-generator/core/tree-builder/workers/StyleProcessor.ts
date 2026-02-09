/**
 * Style Processor
 *
 * 스타일 분류 및 Position 처리를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - StyleClassifier: variant 스타일을 base/dynamic/pseudo로 분류
 * - PositionStyler: absolute positioning 스타일 계산
 */

import type { StyleDefinition, PreparedDesignData } from "@code-generator/types/architecture";
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
}

export default StyleProcessor;
