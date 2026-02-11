/**
 * Node Processor
 *
 * 노드 타입 매핑 및 의미론적 역할 감지를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - NodeTypeMapper: Figma 타입 → DesignNodeType 매핑
 * - SemanticRoleDetector: 노드의 의미론적 역할 감지
 */

import type { DesignNodeType, PreparedDesignData } from "@code-generator/types/architecture";
import type {
  INodeTypeMapper,
  ISemanticRoleDetector,
  SemanticNode,
  SemanticRoleResult,
  InternalNode,
  BuildContext,
  SemanticRoleEntry,
} from "./interfaces";
import type { FigmaFill } from "./utils/instanceUtils";
import { FIGMA_TO_DESIGN_TYPE } from "./utils/nodeTypeUtils";
import { traverseTree } from "./utils/treeUtils";

// ============================================================================
// NodeProcessor Class
// ============================================================================

export class NodeProcessor implements INodeTypeMapper, ISemanticRoleDetector {
  // ==========================================================================
  // Static Utility Methods
  // ==========================================================================

  static isComponentReference(figmaType: string): boolean {
    return figmaType === "INSTANCE";
  }

  // ==========================================================================
  // Static Pipeline Method
  // ==========================================================================

  static detectSemanticRoles(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("NodeProcessor.detectSemanticRoles: internalTree is required.");
    }

    const instance = new NodeProcessor();
    const semanticRoles = instance.applySemanticRolesFromInternalTree(
      ctx.internalTree,
      ctx.data
    ) as Map<string, SemanticRoleEntry>;

    return { ...ctx, semanticRoles };
  }

  static mapTypes(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("NodeProcessor.mapTypes: internalTree is required.");
    }

    const instance = new NodeProcessor();
    const nodeTypes = new Map<string, DesignNodeType>();

    traverseTree(ctx.internalTree, (node) => {
      // Heuristics에서 semanticType이 설정된 경우 해당 타입으로 매핑
      const semanticEntry = ctx.nodeSemanticTypes?.get(node.id);
      if (semanticEntry?.type === "textInput") {
        nodeTypes.set(node.id, "input");
      } else {
        nodeTypes.set(node.id, instance.mapNodeType(node.type));
      }
    });

    return { ...ctx, nodeTypes };
  }

  // ==========================================================================
  // NodeTypeMapper Methods
  // ==========================================================================

  public mapNodeType(figmaType: string): DesignNodeType {
    return FIGMA_TO_DESIGN_TYPE[figmaType] ?? "container";
  }

  public isComponentReference(figmaType: string): boolean {
    return NodeProcessor.isComponentReference(figmaType);
  }

  public isContainerType(figmaType: string): boolean {
    return this.mapNodeType(figmaType) === "container";
  }

  public isVectorType(figmaType: string): boolean {
    return this.mapNodeType(figmaType) === "vector";
  }

  public isTextType(figmaType: string): boolean {
    return figmaType === "TEXT";
  }

  // ==========================================================================
  // SemanticRoleDetector Methods
  // ==========================================================================

  public isButtonComponent(componentName: string, data?: PreparedDesignData): boolean {
    const lowerName = componentName.toLowerCase();

    // Check name patterns
    if (lowerName.includes("button") || lowerName.includes("btn") || lowerName.includes("cta")) {
      return true;
    }

    // Check for button-like State variants (Hover, Pressed, Disabled)
    if (data) {
      const props = data.props as Record<string, { type?: string; variantOptions?: string[] }> | undefined;
      if (props) {
        const stateProps = ["State", "state"];
        for (const statePropName of stateProps) {
          const stateProp = props[statePropName];
          if (stateProp?.type === "VARIANT" && stateProp.variantOptions) {
            const hasHover = stateProp.variantOptions.some(o => o.toLowerCase() === "hover");
            const hasPressed = stateProp.variantOptions.some(o => o.toLowerCase() === "pressed" || o.toLowerCase() === "active");
            const hasDisabled = stateProp.variantOptions.some(o => o.toLowerCase() === "disabled");
            // If it has 2 or more of these button-like states, it's likely a button
            const buttonLikeStateCount = [hasHover, hasPressed, hasDisabled].filter(Boolean).length;
            if (buttonLikeStateCount >= 2) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  public detectSemanticRole(
    node: SemanticNode,
    data: PreparedDesignData,
    rootName: string
  ): SemanticRoleResult {
    const nodeSpec = data.getNodeById(node.id);

    // 루트 노드
    if (node.parent === null) {
      const result: SemanticRoleResult = {
        role: this.isButtonComponent(rootName, data) ? "button" : "root",
      };

      // 루트 노드에 vectorSvg가 있으면 추가 (dependency 컴포넌트의 경우)
      // DependencyManager가 enrichWithVectorSvg로 루트에 SVG를 설정함
      // 단, 아이콘 패턴인 경우에만 적용 (Select 같은 컨테이너 컴포넌트는 제외)
      const rootVectorSvg = data.getVectorSvgByNodeId?.(node.id);
      if (rootVectorSvg && this.isIconPattern(node, rootName)) {
        result.role = "icon";
        result.vectorSvg = rootVectorSvg;
      }

      // _variantSvgs가 있으면 조건부 SVG 렌더링 설정
      // 단, 아이콘 패턴인 경우에만 적용
      const spec = data.spec as any;
      const variantSvgs = spec?._variantSvgs;
      if (variantSvgs && Object.keys(variantSvgs).length > 0 && this.isIconPattern(node, rootName)) {
        result.role = "icon";
        // 첫 번째 SVG를 기본값으로 설정
        result.vectorSvg = Object.values(variantSvgs)[0] as string;
        // variant별 다른 SVG가 있으면 variantSvgs 설정
        const uniqueSvgs = new Set(Object.values(variantSvgs));
        if (uniqueSvgs.size > 1) {
          result.variantSvgs = variantSvgs;
        }
      }

      return result;
    }

    // Figma 타입별 매핑
    switch (node.type) {
      case "TEXT":
        return { role: "text" };

      case "INSTANCE":
        return this.detectInstanceRole(node, data);

      case "VECTOR":
      case "LINE":
      case "ELLIPSE":
      case "STAR":
      case "POLYGON":
      case "BOOLEAN_OPERATION":
        return this.detectVectorRole(node, data);

      case "RECTANGLE":
        return this.detectRectangleRole(nodeSpec);

      case "FRAME":
      case "GROUP":
      case "COMPONENT":
      default:
        return { role: "container" };
    }
  }

  public convertToSemanticTree(
    node: InternalNode,
    parent: SemanticNode | null = null
  ): SemanticNode {
    const semanticNode: SemanticNode = {
      id: node.id,
      type: node.type,
      name: node.name,
      parent,
      children: [],
    };

    semanticNode.children = node.children.map((child) =>
      this.convertToSemanticTree(child, semanticNode)
    );

    return semanticNode;
  }

  public applySemanticRoles(
    root: SemanticNode,
    data: PreparedDesignData
  ): Map<string, SemanticRoleResult> {
    const results = new Map<string, SemanticRoleResult>();
    const rootName = root.name;

    const processNode = (node: SemanticNode) => {
      const result = this.detectSemanticRole(node, data, rootName);
      results.set(node.id, result);

      for (const child of node.children) {
        processNode(child);
      }
    };

    processNode(root);
    return results;
  }

  public applySemanticRolesFromInternalTree(
    root: InternalNode,
    data: PreparedDesignData
  ): Map<string, SemanticRoleResult> {
    const semanticTree = this.convertToSemanticTree(root);
    return this.applySemanticRoles(semanticTree, data);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private detectInstanceRole(node: SemanticNode, data: PreparedDesignData): SemanticRoleResult {
    // 아이콘 패턴인지 확인
    // INSTANCE가 외부 컴포넌트로 처리되면 externalRef가 설정되어 이 role은 무시됨
    // externalRef가 없는 INSTANCE만 이 로직이 적용됨
    if (!this.isIconPatternInstance(node)) {
      // 아이콘 패턴이 아니면 container로 처리
      return { role: "container" };
    }

    // 아이콘 패턴이면 SVG 찾기
    const result: SemanticRoleResult = { role: "icon" };

    const mergedSvg = data.mergeInstanceVectorSvgs?.(node.id);
    if (mergedSvg) {
      result.vectorSvg = mergedSvg;
    } else {
      const vectorSvg = data.getFirstVectorSvgByInstanceId?.(node.id);
      if (vectorSvg) {
        result.vectorSvg = vectorSvg;
      }
    }

    // SVG가 없으면 container로 폴백
    if (!result.vectorSvg) {
      return { role: "container" };
    }

    return result;
  }

  /**
   * INSTANCE가 아이콘 패턴인지 확인
   *
   * 아이콘 패턴 조건:
   * 1. 이름에 아이콘 관련 키워드가 포함 (icon, arrow, caret, chevron, glyph)
   * 2. children이 없거나 모두 VECTOR 타입
   */
  private isIconPatternInstance(node: SemanticNode): boolean {
    const lowerName = node.name.toLowerCase();

    // 이름에 아이콘 관련 키워드가 포함
    const iconKeywords = ["icon", "arrow", "caret", "chevron", "glyph"];
    if (iconKeywords.some((keyword) => lowerName.includes(keyword))) {
      return true;
    }

    // children이 없음
    if (node.children.length === 0) {
      return true;
    }

    // children이 모두 VECTOR 타입
    const vectorTypes = new Set([
      "VECTOR",
      "LINE",
      "ELLIPSE",
      "STAR",
      "POLYGON",
      "BOOLEAN_OPERATION",
    ]);
    const allChildrenAreVectors = node.children.every((child) =>
      vectorTypes.has(child.type)
    );

    return allChildrenAreVectors;
  }

  private detectVectorRole(node: SemanticNode, data: PreparedDesignData): SemanticRoleResult {
    const result: SemanticRoleResult = { role: "vector" };
    // 정확한 매칭 먼저 시도, 없으면 suffix 매칭 시도
    const vectorSvg = data.getVectorSvgByNodeId?.(node.id) ?? data.getVectorSvgBySuffix?.(node.id);
    if (vectorSvg) {
      result.vectorSvg = vectorSvg;
    }
    return result;
  }

  private detectRectangleRole(nodeSpec: SceneNode | undefined): SemanticRoleResult {
    if (!nodeSpec) return { role: "container" };

    const fills = (nodeSpec as { fills?: FigmaFill[] }).fills;
    if (Array.isArray(fills)) {
      const hasImageFill = fills.some(
        (fill) => fill.type === "IMAGE" && fill.visible !== false
      );
      if (hasImageFill) {
        return { role: "image" };
      }
    }

    return { role: "container" };
  }

  /**
   * 컴포넌트가 아이콘 패턴인지 확인
   *
   * 아이콘 패턴 조건 (하나라도 만족하면 true):
   * 1. 이름에 아이콘 관련 키워드가 포함 (icon, arrow, caret, chevron, glyph)
   * 2. children이 없음
   * 3. children이 모두 VECTOR 타입 (VECTOR, LINE, ELLIPSE, STAR, POLYGON, BOOLEAN_OPERATION)
   *
   * @param node - 루트 노드
   * @param rootName - 컴포넌트 이름
   * @returns 아이콘 패턴이면 true
   */
  private isIconPattern(node: SemanticNode, rootName: string): boolean {
    const lowerName = rootName.toLowerCase();

    // 1. 이름에 아이콘 관련 키워드가 포함
    const iconKeywords = ["icon", "arrow", "caret", "chevron", "glyph"];
    if (iconKeywords.some((keyword) => lowerName.includes(keyword))) {
      return true;
    }

    // 2. children이 없음
    if (node.children.length === 0) {
      return true;
    }

    // 3. children이 모두 VECTOR 타입
    const vectorTypes = new Set([
      "VECTOR",
      "LINE",
      "ELLIPSE",
      "STAR",
      "POLYGON",
      "BOOLEAN_OPERATION",
    ]);
    const allChildrenAreVectors = node.children.every((child) =>
      vectorTypes.has(child.type)
    );
    if (allChildrenAreVectors) {
      return true;
    }

    return false;
  }
}

export default NodeProcessor;
