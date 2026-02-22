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
import { HeuristicsRunner } from "./heuristics/HeuristicsRunner";
import { InstanceSlotProcessor } from "./processors/InstanceSlotProcessor";

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
 * 6. 휴리스틱 (HeuristicsRunner)
 */
class TreeBuilder {
  private readonly dataManager: DataManager;
  private readonly variantMerger: VariantMerger;
  private readonly propsExtractor: PropsExtractor;
  private readonly instanceSlotProcessor: InstanceSlotProcessor;
  private readonly styleProcessor: StyleProcessor;
  private readonly visibilityProcessor: VisibilityProcessor;
  private readonly externalRefsProcessor: ExternalRefsProcessor;
  private readonly heuristicsRunner: HeuristicsRunner;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.variantMerger = new VariantMerger(dataManager);
    this.propsExtractor = new PropsExtractor(dataManager);
    this.instanceSlotProcessor = new InstanceSlotProcessor();
    this.styleProcessor = new StyleProcessor(dataManager);
    this.visibilityProcessor = new VisibilityProcessor();
    this.externalRefsProcessor = new ExternalRefsProcessor(dataManager);
    this.heuristicsRunner = new HeuristicsRunner();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * 파이프라인 진입점
   * SceneNode → UITree 변환
   */
  public build(node: SceneNode): UITree {
    // Step 1: 변형 병합
    let tree = this.variantMerger.merge(node);

    // Step 2: Props 추출/바인딩
    let props = this.propsExtractor.extract();

    // Step 2.5: INSTANCE slot 변환 (visibility 제어 INSTANCE → slot)
    props = this.instanceSlotProcessor.convertVisibilityInstanceToSlot(tree, props);

    // Step 3: 스타일 처리
    tree = this.styleProcessor.applyStyles(tree);

    // Step 4: 가시성 조건 (props 전달하여 rename 매핑 사용)
    tree = this.visibilityProcessor.applyVisibility(tree, props);

    // Step 5: 외부 참조 (INSTANCE refId + 의존 컴포넌트 Vector SVG)
    tree = this.externalRefsProcessor.resolveExternalRefs(tree);

    // Step 6: 휴리스틱 (컴포넌트 타입 판별, semanticType 설정, props 추가)
    const heuristicsResult = this.heuristicsRunner.run(tree, this.dataManager, props);

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
  public buildInternalTreeDebug(node: SceneNode): InternalTree {
    return this.variantMerger.merge(node);
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
      // metadata에 SVG가 있으면 우선 사용 (파이프라인에서 전달된 경우)
      vectorSvg = tree.metadata?.vectorSvg;

      // metadata에 없으면 DataManager에서 조회
      if (!vectorSvg) {
        vectorSvg = this.dataManager.getVectorSvgByNodeId(tree.id);
        if (!vectorSvg) {
          vectorSvg = this.dataManager.getVectorSvgByLastSegment(tree.id);
        }
      }
    }

    // TEXT 노드인 경우 텍스트 내용 추출
    let textSegments: Array<{ text: string }> | undefined;
    if (nodeType === "text") {
      const node = this.dataManager.getById(tree.id).node;
      if (node && "characters" in node && typeof node.characters === "string") {
        textSegments = [{ text: node.characters }];
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
      ...(nodeType === "text" && textSegments ? { textSegments } : {}),
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
      // metadata에 SVG가 있으면 우선 사용 (파이프라인에서 전달된 경우)
      vectorSvg = node.metadata?.vectorSvg;

      // metadata에 없으면 DataManager에서 조회
      if (!vectorSvg) {
        vectorSvg = this.dataManager.getVectorSvgByNodeId(node.id);
        // 없으면 INSTANCE 경로의 마지막 세그먼트로 매칭 시도
        if (!vectorSvg) {
          vectorSvg = this.dataManager.getVectorSvgByLastSegment(node.id);
        }
      }
    }

    // TEXT 노드인 경우 텍스트 내용 추출
    let textSegments: Array<{ text: string }> | undefined;
    if (nodeType === "text") {
      const sceneNode = this.dataManager.getById(node.id).node;
      if (sceneNode && "characters" in sceneNode && typeof sceneNode.characters === "string") {
        textSegments = [{ text: sceneNode.characters }];
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
      ...(nodeType === "text" && textSegments ? { textSegments } : {}),
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
