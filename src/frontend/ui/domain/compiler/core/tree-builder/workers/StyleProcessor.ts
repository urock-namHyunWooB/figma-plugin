/**
 * Style Processor
 *
 * 스타일 분류 및 Position 처리를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - StyleClassifier: variant 스타일을 base/dynamic/pseudo로 분류
 * - PositionStyler: absolute positioning 스타일 계산
 */

import type { StyleDefinition, PreparedDesignData } from "@compiler/types/architecture";
import type { ConditionNode, PseudoClass } from "@compiler/types/customType";
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

/**
 * State prop 값과 CSS pseudo-class 매핑
 */
const STATE_TO_PSEUDO: Record<string, PseudoClass | null> = {
  // Hover states
  hover: ":hover",
  hovered: ":hover",
  hovering: ":hover",

  // Active states
  active: ":active",
  pressed: ":active",
  pressing: ":active",
  clicked: ":active",

  // Focus states
  focus: ":focus",
  focused: ":focus",
  "focus-visible": ":focus-visible",

  // Disabled states
  disabled: ":disabled",
  inactive: ":disabled",

  // Default states (no pseudo-class)
  default: null,
  normal: null,
  enabled: null,
  rest: null,
  idle: null,

  // Checked/Selected states
  selected: ":checked",
  checked: ":checked",

  // Visited state
  visited: ":visited",
};

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

  static build(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("StyleProcessor.build: internalTree is required.");
    }

    const instance = new StyleProcessor();
    const nodeStyles = new Map<string, StyleDefinition>();

    const traverse = (node: InternalNode) => {
      const styles = instance.buildFromMergedNodes(
        { mergedNodes: node.mergedNode, data: ctx.data },
        VisibilityProcessor.parseVariantCondition
      );
      nodeStyles.set(node.id, styles);
      for (const child of node.children) {
        traverse(child);
      }
    };
    traverse(ctx.internalTree);

    return { ...ctx, nodeStyles };
  }

  static applyPositions(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.nodeStyles) {
      throw new Error("StyleProcessor.applyPositions: internalTree and nodeStyles are required.");
    }

    const instance = new StyleProcessor();
    const nodeStyles = new Map(ctx.nodeStyles);

    const traverse = (node: InternalNode) => {
      const currentStyles = nodeStyles.get(node.id);
      if (currentStyles) {
        const updatedStyles = instance.applyToStyleDefinition(node, currentStyles, ctx.data);
        nodeStyles.set(node.id, updatedStyles);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };
    traverse(ctx.internalTree);

    return { ...ctx, nodeStyles };
  }

  static handleRotation(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.nodeStyles) {
      throw new Error("StyleProcessor.handleRotation: internalTree and nodeStyles are required.");
    }

    const instance = new StyleProcessor();
    const nodeStyles = new Map(ctx.nodeStyles);

    const traverse = (node: InternalNode) => {
      const nodeSpec = (ctx.data).getNodeById(node.id);
      const currentStyles = nodeStyles.get(node.id);
      if (nodeSpec && currentStyles) {
        const updatedBase = instance.handleRotatedElement(nodeSpec, currentStyles.base);
        nodeStyles.set(node.id, { ...currentStyles, base: updatedBase });
      }
      for (const child of node.children) {
        traverse(child);
      }
    };
    traverse(ctx.internalTree);

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
   * State 값을 CSS pseudo-class로 변환
   */
  public stateToPseudo(state: string): PseudoClass | null | undefined {
    const normalizedState = state.toLowerCase();
    if (normalizedState in STATE_TO_PSEUDO) {
      return STATE_TO_PSEUDO[normalizedState];
    }
    return undefined;
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

    // 3. dynamic 및 pseudo 스타일 분류
    const dynamic: StyleDefinition["dynamic"] = [];
    const pseudo: StyleDefinition["pseudo"] = {};

    for (const vs of variantStyles) {
      const state = this.extractStateFromVariantName(vs.variantName);
      const pseudoClass = state ? this.stateToPseudo(state) : undefined;

      const dynamicStyle: Record<string, string | number> = {};
      for (const key of dynamicKeys) {
        if (vs.cssStyle[key] !== undefined) {
          dynamicStyle[key] = vs.cssStyle[key];
        }
      }

      if (Object.keys(dynamicStyle).length === 0) continue;

      if (pseudoClass) {
        pseudo[pseudoClass] = { ...pseudo[pseudoClass], ...dynamicStyle };
      } else if (pseudoClass === null) {
        continue;
      } else {
        const condition = parseCondition(vs.variantName);
        if (condition) {
          dynamic.push({ condition, style: dynamicStyle });
        }
      }
    }

    return {
      base,
      dynamic,
      ...(Object.keys(pseudo).length > 0 ? { pseudo } : {}),
    };
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
