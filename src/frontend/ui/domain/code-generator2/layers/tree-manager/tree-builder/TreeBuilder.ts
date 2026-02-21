import {
  UITree,
  UINode,
  FigmaNodeData,
  InternalTree,
  PropDefinition,
  ComponentType,
} from "../../../types/types";
import DataManager from "../../data-manager/DataManager";
import { VariantMerger } from "./processors/VariantMerger";
import { PropsExtractor } from "./processors/PropsExtractor";
import { StyleProcessor } from "./processors/StyleProcessor";
import { VisibilityProcessor } from "./processors/VisibilityProcessor";
import { ExternalRefsProcessor } from "./processors/ExternalRefsProcessor";
import { HeuristicsProcessor } from "./processors/HeuristicsProcessor";

/**
 * TreeBuilder
 *
 * FigmaNodeData → UITree 변환 파이프라인 오케스트레이터
 *
 * 6단계 파이프라인:
 * 1. 변형 병합 (VariantMerger)
 * 2. Props 추출/바인딩
 * 3. 스타일 처리
 * 4. 가시성 조건
 * 5. 외부 참조
 * 6. 휴리스틱 (HeuristicsProcessor)
 */
class TreeBuilder {
  private readonly dataManager: DataManager;
  private readonly variantMerger: VariantMerger;
  private readonly propsExtractor: PropsExtractor;
  private readonly styleProcessor: StyleProcessor;
  private readonly visibilityProcessor: VisibilityProcessor;
  private readonly externalRefsProcessor: ExternalRefsProcessor;
  private readonly heuristicsProcessor: HeuristicsProcessor;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.variantMerger = new VariantMerger(dataManager);
    this.propsExtractor = new PropsExtractor(dataManager);
    this.styleProcessor = new StyleProcessor(dataManager);
    this.visibilityProcessor = new VisibilityProcessor();
    this.externalRefsProcessor = new ExternalRefsProcessor(dataManager);
    this.heuristicsProcessor = new HeuristicsProcessor(dataManager);
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
    const props = this.propsExtractor.extract();

    // Step 3: 스타일 처리
    tree = this.styleProcessor.applyStyles(tree);

    // Step 4: 가시성 조건
    tree = this.visibilityProcessor.applyVisibility(tree);

    // Step 5: 외부 참조
    tree = this.externalRefsProcessor.resolveExternalRefs(tree);

    // Step 6: 휴리스틱 (컴포넌트 타입 판별, semanticType 설정)
    const heuristicsResult = this.heuristicsProcessor.apply(tree);

    // 최종 변환: InternalTree → UINode
    const root = this.convertToUINode(tree, heuristicsResult.rootNodeType);

    return {
      root,
      props,
      componentType: heuristicsResult.componentType,
    };
  }

  /**
   * 디버그용: InternalTree 반환 (Step 1 결과)
   */
  public buildInternalTreeDebug(spec: FigmaNodeData): InternalTree {
    return this.variantMerger.merge(spec.info.document);
  }

  private convertToUINode(
    tree: InternalTree,
    rootNodeType?: "button" | "input" | "link"
  ): UINode {
    // 루트 노드: 휴리스틱이 지정한 타입 사용 (있으면)
    let nodeType = rootNodeType || this.mapToUINodeType(tree.type);

    // 루트 INSTANCE는 container로 처리 (자기 참조 방지, 무한 재귀 방지)
    if (nodeType === "component" && !rootNodeType) {
      nodeType = "container";
    }

    // 보이지 않는 레이아웃 노드 필터링
    const visibleChildren = tree.children.filter(
      (child) => !this.isInvisibleLayoutNode(child)
    );

    // VECTOR 노드인 경우 SVG 데이터 가져오기
    let vectorSvg: string | undefined;
    if (nodeType === "vector") {
      vectorSvg = this.dataManager.getVectorSvgByNodeId(tree.id);
      if (!vectorSvg) {
        vectorSvg = this.dataManager.getVectorSvgByLastSegment(tree.id);
      }
    }

    return {
      id: tree.id,
      name: tree.name,
      type: nodeType,
      children: visibleChildren.map((child) =>
        this.convertToUINodeRecursive(child)
      ),
      ...(tree.styles ? { styles: tree.styles } : {}),
      ...(tree.visibleCondition
        ? { visibleCondition: tree.visibleCondition }
        : {}),
      ...(tree.bindings ? { bindings: tree.bindings } : {}),
      ...(tree.semanticType ? { semanticType: tree.semanticType } : {}),
      ...(nodeType === "component" && tree.refId ? { refId: tree.refId } : {}),
      ...(nodeType === "vector" && vectorSvg ? { vectorSvg } : {}),
    } as UINode;
  }

  private convertToUINodeRecursive(node: InternalTree): UINode {
    const nodeType = this.mapToUINodeType(node.type);

    // 보이지 않는 레이아웃 노드 필터링
    const visibleChildren = node.children.filter(
      (child) => !this.isInvisibleLayoutNode(child)
    );

    // VECTOR 노드인 경우 SVG 데이터 가져오기
    let vectorSvg: string | undefined;
    if (nodeType === "vector") {
      // 먼저 직접 ID로 조회
      vectorSvg = this.dataManager.getVectorSvgByNodeId(node.id);
      // 없으면 INSTANCE 경로의 마지막 세그먼트로 매칭 시도
      if (!vectorSvg) {
        vectorSvg = this.dataManager.getVectorSvgByLastSegment(node.id);
      }
    }

    return {
      id: node.id,
      name: node.name,
      type: nodeType,
      children: visibleChildren.map((child) =>
        this.convertToUINodeRecursive(child)
      ),
      ...(node.styles ? { styles: node.styles } : {}),
      ...(node.visibleCondition
        ? { visibleCondition: node.visibleCondition }
        : {}),
      ...(node.bindings ? { bindings: node.bindings } : {}),
      ...(node.semanticType ? { semanticType: node.semanticType } : {}),
      ...(nodeType === "component" && node.refId ? { refId: node.refId } : {}),
      ...(nodeType === "vector" && vectorSvg ? { vectorSvg } : {}),
    } as UINode;
  }

  /**
   * 보이지 않는 레이아웃 제약 노드인지 확인
   * - LINE 타입 + height 0 → 레이아웃 제약 요소 (Min Width 등)
   */
  private isInvisibleLayoutNode(node: InternalTree): boolean {
    // LINE 타입이고 height가 0이면 보이지 않는 레이아웃 노드
    if (node.type === "LINE" && node.bounds?.height === 0) {
      return true;
    }
    return false;
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
