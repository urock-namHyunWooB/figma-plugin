/**
 * Node Processor
 *
 * 노드 타입 매핑 및 의미론적 역할 감지를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - NodeTypeMapper: Figma 타입 → DesignNodeType 매핑
 * - SemanticRoleDetector: 노드의 의미론적 역할 감지
 */

import type { DesignNodeType, PreparedDesignData } from "@compiler/types/architecture";
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

    const traverse = (node: InternalNode) => {
      nodeTypes.set(node.id, instance.mapNodeType(node.type));
      for (const child of node.children) {
        traverse(child);
      }
    };
    traverse(ctx.internalTree);

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

  public isButtonComponent(componentName: string): boolean {
    const lowerName = componentName.toLowerCase();
    return lowerName.includes("button") || lowerName.includes("btn") || lowerName.includes("cta");
  }

  public detectSemanticRole(
    node: SemanticNode,
    data: PreparedDesignData,
    rootName: string
  ): SemanticRoleResult {
    const nodeSpec = data.getNodeById(node.id);

    // 루트 노드
    if (node.parent === null) {
      return {
        role: this.isButtonComponent(rootName) ? "button" : "root",
      };
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

    return result;
  }

  private detectVectorRole(node: SemanticNode, data: PreparedDesignData): SemanticRoleResult {
    const result: SemanticRoleResult = { role: "vector" };
    const vectorSvg = data.getVectorSvgByNodeId?.(node.id);
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
}

export default NodeProcessor;
