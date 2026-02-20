import {
  UITree,
  UINode,
  FigmaNodeData,
  InternalTree,
  PropDefinition,
} from "../../../types/types";
import DataManager from "../../data-manager/DataManager";
import { VariantMerger } from "./processors/VariantMerger";

/**
 * TreeBuilder
 *
 * FigmaNodeData → UITree 변환 파이프라인 오케스트레이터
 *
 * 5단계 파이프라인:
 * 1. 변형 병합 (VariantMerger)
 * 2. Props 추출/바인딩
 * 3. 스타일 처리
 * 4. 가시성 조건
 * 5. 외부 참조
 */
class TreeBuilder {
  private readonly dataManager: DataManager;
  private readonly variantMerger: VariantMerger;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.variantMerger = new VariantMerger(dataManager);
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * 파이프라인 진입점
   * FigmaNodeData → UITree 변환
   */
  public build(spec: FigmaNodeData): UITree {
    const document = spec.info.document;

    // Step 1: 변형 병합
    let tree = this.variantMerger.merge(document);

    // Step 2: Props 추출/바인딩
    const props = this.extractProps(spec, tree);

    // Step 3: 스타일 처리
    tree = this.applyStyles(tree);

    // Step 4: 가시성 조건
    tree = this.applyVisibility(tree);

    // Step 5: 외부 참조
    tree = this.resolveExternalRefs(tree);

    // 최종 변환: InternalTree → UINode
    const root = this.convertToUINode(tree);

    return {
      root,
      props,
    };
  }

  /**
   * 디버그용: InternalTree 반환 (Step 1 결과)
   */
  public buildInternalTreeDebug(spec: FigmaNodeData): InternalTree {
    return this.variantMerger.merge(spec.info.document);
  }

  // ===========================================================================
  // Step 2: Props 추출/바인딩
  // ===========================================================================

  private extractProps(
    _spec: FigmaNodeData,
    _tree: InternalTree
  ): PropDefinition[] {
    // TODO: 구현
    return [];
  }

  // ===========================================================================
  // Step 3: 스타일 처리
  // ===========================================================================

  private applyStyles(tree: InternalTree): InternalTree {
    // TODO: 구현
    return tree;
  }

  // ===========================================================================
  // Step 4: 가시성 조건
  // ===========================================================================

  private applyVisibility(tree: InternalTree): InternalTree {
    // TODO: 구현
    return tree;
  }

  // ===========================================================================
  // Step 5: 외부 참조
  // ===========================================================================

  private resolveExternalRefs(tree: InternalTree): InternalTree {
    // TODO: 구현
    return tree;
  }

  // ===========================================================================
  // 최종 변환: InternalTree → UINode
  // ===========================================================================

  private convertToUINode(tree: InternalTree): UINode {
    return {
      id: tree.id,
      name: tree.name,
      type: this.mapToUINodeType(tree.type),
      children: tree.children.map((child) => this.convertToUINodeRecursive(child)),
    };
  }

  private convertToUINodeRecursive(node: InternalTree): UINode {
    return {
      id: node.id,
      name: node.name,
      type: this.mapToUINodeType(node.type),
      children: node.children.map((child) => this.convertToUINodeRecursive(child)),
    };
  }

  /**
   * Figma 노드 타입을 UINodeType으로 매핑
   */
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

export default TreeBuilder;
