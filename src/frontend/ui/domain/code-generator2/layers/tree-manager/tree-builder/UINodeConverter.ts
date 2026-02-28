import type { InternalTree, UINode } from "../../../types/types";
import type DataManager from "../../data-manager/DataManager";
import { TextProcessor } from "./processors/TextProcessor";

/**
 * InternalTree → UINode 변환기
 *
 * TreeBuilder 파이프라인의 마지막 단계로,
 * 내부 표현(InternalTree)을 최종 UINode 트리로 변환한다.
 */
class UINodeConverter {
  private readonly dataManager: DataManager;
  private readonly textProcessor: TextProcessor;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.textProcessor = new TextProcessor(dataManager);
  }

  /**
   * 루트 노드 변환 (휴리스틱이 지정한 rootNodeType 적용)
   */
  public convert(
    tree: InternalTree,
    rootNodeType?: "button" | "input" | "link"
  ): UINode {
    let nodeType = rootNodeType || this.mapToUINodeType(tree.type);

    if (nodeType === "component" && !rootNodeType) {
      nodeType = "container";
    }

    return this.buildUINode(tree, nodeType, { isRoot: true });
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private convertRecursive(node: InternalTree): UINode {
    let nodeType = this.mapToUINodeType(node.type);

    if (nodeType === "component" && !node.refId) {
      nodeType = "container";
    }

    if (nodeType === "component" && node.refId) {
      if (this.dependencyHasOriginalChildren(node.refId)) {
        return {
          id: node.id,
          name: node.name,
          type: nodeType,
          children: [],
          refId: node.refId,
          ...(node.styles ? { styles: node.styles } : {}),
          ...(node.visibleCondition
            ? { visibleCondition: node.visibleCondition }
            : {}),
          ...(node.bindings ? { bindings: node.bindings } : {}),
          ...(node.semanticType ? { semanticType: node.semanticType } : {}),
        } as UINode;
      }
    }

    return this.buildUINode(node, nodeType, { isRoot: false });
  }

  /**
   * UINode 구성 — 루트/재귀 공통 로직 통합
   */
  private buildUINode(
    node: InternalTree,
    nodeType: UINode["type"],
    opts: { isRoot: boolean }
  ): UINode {
    const visibleChildren = node.children.filter(
      (child) => !this.isInvisibleLayoutNode(child)
    );

    const vectorSvg = nodeType === "vector" ? this.resolveVectorSvg(node) : undefined;
    const textSegments =
      nodeType === "text"
        ? this.textProcessor.processTextNode(node.id)
        : undefined;

    return {
      id: node.id,
      name: node.name,
      type: nodeType,
      children: visibleChildren.map((child) => this.convertRecursive(child)),
      ...(node.styles ? { styles: node.styles } : {}),
      ...(node.visibleCondition
        ? { visibleCondition: node.visibleCondition }
        : {}),
      ...(node.bindings ? { bindings: node.bindings } : {}),
      ...(node.semanticType ? { semanticType: node.semanticType } : {}),
      ...(!opts.isRoot && node.loop ? { loop: node.loop } : {}),
      ...(nodeType === "component" && node.refId ? { refId: node.refId } : {}),
      ...(nodeType === "vector" && vectorSvg ? { vectorSvg } : {}),
      ...(nodeType === "text" && textSegments ? { textSegments } : {}),
    } as UINode;
  }

  /**
   * Vector SVG 해석: metadata → DataManager(nodeId) → DataManager(lastSegment)
   */
  private resolveVectorSvg(node: InternalTree): string | undefined {
    if (node.metadata?.vectorSvg) return node.metadata.vectorSvg;

    const svg = this.dataManager.getVectorSvgByNodeId(node.id);
    if (svg) return svg;

    return this.dataManager.getVectorSvgByLastSegment(node.id);
  }

  private dependencyHasOriginalChildren(refId: string): boolean {
    const depData = this.dataManager.getById(refId);
    if (!depData.spec) return false;
    const depChildren = depData.spec.info?.document?.children || [];
    return depChildren.some((c: any) => c.id && !c.id.startsWith("I"));
  }

  private isInvisibleLayoutNode(node: InternalTree): boolean {
    if (node.type === "LINE" && node.bounds?.height === 0) {
      return true;
    }
    return false;
  }

  private mapToUINodeType(figmaType: string): UINode["type"] {
    switch (figmaType) {
      case "COMPONENT":
      case "COMPONENT_SET":
      case "FRAME":
        return "container";
      case "TEXT":
        return "text";
      case "INSTANCE":
        return "component";
      case "RECTANGLE":
      case "ELLIPSE":
      case "VECTOR":
      case "LINE":
      case "POLYGON":
      case "STAR":
        return "vector";
      default:
        return "container";
    }
  }
}

export default UINodeConverter;
