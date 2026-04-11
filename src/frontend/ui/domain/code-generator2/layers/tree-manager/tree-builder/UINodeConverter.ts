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
      const overrides = node.metadata?.instanceOverrides;
      const instanceScale = this.computeInstanceScale(node);
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
        ...(node.mergedNodes ? { mergedNodes: node.mergedNodes } : {}),
        ...(overrides
          ? {
              overrideProps: Object.fromEntries(
                overrides.map((o) => [o.propName, o.value])
              ),
              overrideMeta: overrides,
            }
          : {}),
        ...(instanceScale && Math.abs(instanceScale - 1) > 0.01
          ? { instanceScale }
          : {}),
      } as UINode;
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

    // VECTOR + SVG 처리:
    // 1. SVG width/height를 100%로 → CSS 컨테이너에 맞춰 자동 스케일
    //    (INSTANCE 스케일 SVG도 COMPONENT 스케일 컨테이너에 맞춰짐)
    // 2. pseudo에서 width/height 제거 (hover/active 시 크기 변경은 viewBox 왜곡 유발)
    //    dynamic은 유지: variant별 크기 차이(Size=Large vs Medium 등)는
    //    CSS 컨테이너 크기로 반영되어야 하며, SVG 100% 스케일이 비례 축소/확대 처리
    if (vectorSvg && node.styles) {
      if (node.styles.pseudo) {
        const cleanedPseudo: typeof node.styles.pseudo = {};
        for (const [key, pseudoStyle] of Object.entries(node.styles.pseudo)) {
          const { width, height, ...rest } = pseudoStyle as Record<string, unknown>;
          cleanedPseudo[key as keyof typeof cleanedPseudo] = rest as Record<string, string | number>;
        }
        node = { ...node, styles: { ...node.styles, pseudo: cleanedPseudo } };
      }
    }

    // SVG 100%: filter/effects가 없는 벡터만 적용
    // (filter가 있으면 viewBox에 shadow 영역이 포함되어 100%로 축소 시 왜곡)
    // overflow="visible": stroke가 viewBox 밖으로 확장될 수 있으므로 clipping 방지
    const hasFilter = node.styles?.base?.filter;
    const finalVectorSvg = vectorSvg && !hasFilter
      ? vectorSvg
          .replace(/<svg([^>]*)\bwidth="[^"]+"/,  '<svg$1 width="100%"')
          .replace(/<svg([^>]*)\bheight="[^"]+"/,  '<svg$1 height="100%"')
          .replace(/<svg\b/,  '<svg overflow="visible"')
      : vectorSvg;

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
      ...(node.mergedNodes ? { mergedNodes: node.mergedNodes } : {}),
      ...(node.loop ? { loop: node.loop } : {}),
      ...(node.childrenSlot ? { childrenSlot: node.childrenSlot } : {}),
      ...(nodeType === "component" && node.refId ? { refId: node.refId } : {}),
      ...(nodeType === "vector" && finalVectorSvg ? { vectorSvg: finalVectorSvg } : {}),
      ...(nodeType === "text" && textSegments ? { textSegments } : {}),
      ...(node.metadata?.designPatterns?.length
        ? { metadata: { designPatterns: node.metadata.designPatterns } }
        : {}),
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

  /**
   * INSTANCE/COMPONENT 크기 비율 계산
   * INSTANCE bounds (main 컴포넌트 내) vs dependency root bounds (원본 컴포넌트)
   */
  private computeInstanceScale(node: InternalTree): number | undefined {
    if (!node.refId || !node.bounds) return undefined;

    const depSpec = this.dataManager.getAllDependencies().get(node.refId);
    if (!depSpec) return undefined;

    const depRoot = depSpec.info?.document as any;
    const depBox = depRoot?.absoluteBoundingBox;
    if (!depBox || !depBox.width || !depBox.height) return undefined;

    const scaleX = node.bounds.width / depBox.width;
    const scaleY = node.bounds.height / depBox.height;

    return Math.min(scaleX, scaleY);
  }

  private isInvisibleLayoutNode(node: InternalTree): boolean {
    if (node.bounds && node.bounds.height < 1) {
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
      case "BOOLEAN_OPERATION":
        return "vector";
      default:
        return "container";
    }
  }
}

export default UINodeConverter;
