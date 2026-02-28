import {
  UITree,
  UINode,
  InternalTree,
  PropDefinition,
} from "../../../types/types";
import DataManager from "../../data-manager/DataManager";
import { VariantMerger } from "./processors/VariantMerger";
import { PropsExtractor } from "./processors/PropsExtractor";
import { SlotProcessor } from "./processors/SlotProcessor";
import { StyleProcessor } from "./processors/StyleProcessor";
import { VisibilityProcessor } from "./processors/VisibilityProcessor";
import { ExternalRefsProcessor } from "./processors/ExternalRefsProcessor";
import { HeuristicsRunner } from "./heuristics/HeuristicsRunner";
import { BreakpointHeuristic } from "./heuristics/BreakpointHeuristic";
import { TextProcessor } from "./processors/TextProcessor";

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
  private readonly slotProcessor: SlotProcessor;
  private readonly styleProcessor: StyleProcessor;
  private readonly visibilityProcessor: VisibilityProcessor;
  private readonly externalRefsProcessor: ExternalRefsProcessor;
  private readonly heuristicsRunner: HeuristicsRunner;
  private readonly textProcessor: TextProcessor;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.variantMerger = new VariantMerger(dataManager);
    this.propsExtractor = new PropsExtractor(dataManager);
    this.slotProcessor = new SlotProcessor(dataManager);
    this.styleProcessor = new StyleProcessor(dataManager);
    this.visibilityProcessor = new VisibilityProcessor();
    this.externalRefsProcessor = new ExternalRefsProcessor(dataManager);
    this.heuristicsRunner = new HeuristicsRunner();
    this.textProcessor = new TextProcessor(dataManager);
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
    let props = this.propsExtractor.extract(node);

    // Step 2.5: Slot 처리 (통합: 개별 slot + 배열 slot)
    const slotResult = this.slotProcessor.process(tree, props);
    props = slotResult.props;
    let arraySlots = slotResult.arraySlots;

    // Step 3: 스타일 처리
    tree = this.styleProcessor.applyStyles(tree);

    // Array Slot 중복 제거 (동일한 slotName)
    const uniqueArraySlots = Array.from(
      new Map(arraySlots.map((slot) => [slot.slotName, slot])).values()
    );
    arraySlots = uniqueArraySlots;

    // Array Slot에 대한 props 추가 (중복 확인)
    // 이름이 기존 prop(variant 포함)과 충돌하는 array slot은 제거
    const existingPropNames = new Set(props.map((p) => p.name));
    const validArraySlots: typeof arraySlots = [];
    for (const slot of arraySlots) {
      if (!existingPropNames.has(slot.slotName)) {
        props.push({
          name: slot.slotName,
          type: "slot", // Array slot은 slot 타입으로 처리
          required: false,
          sourceKey: slot.slotName,
          defaultValue: [],
        });
        existingPropNames.add(slot.slotName);
        validArraySlots.push(slot);
      }
    }
    arraySlots = validArraySlots;

    // Step 4: 가시성 조건 (props 전달하여 rename 매핑 사용)
    tree = this.visibilityProcessor.applyVisibility(tree, props);

    // Step 5: 외부 참조 (INSTANCE refId + 의존 컴포넌트 Vector SVG)
    tree = this.externalRefsProcessor.resolveExternalRefs(tree);

    this.applyTextPropertyBindings(tree, props);

    // Step 5.5: 브레이크포인트 variant → CSS @media (컴포넌트 휴리스틱과 독립적으로 실행)
    BreakpointHeuristic.run(tree, props);

    // Step 6: 휴리스틱 (컴포넌트 타입 판별, semanticType 설정, props 추가)
    // 현재 컴포넌트의 고유 이름과 propDefs를 전달 (의존 컴포넌트가 메인 컴포넌트의 점수를 상속하지 않도록)
    // NOTE: VariantMerger가 COMPONENT_SET ID를 merged tree.id에 보존하지 않으므로,
    //       원본 node에서 직접 읽어서 전달해야 함
    const componentContext = {
      componentName: node.name,
      propDefs: (node as any)?.componentPropertyDefinitions as
        | Record<string, import("./heuristics/IHeuristic").ComponentPropertyDef>
        | undefined,
    };
    const heuristicsResult = this.heuristicsRunner.run(
      tree,
      this.dataManager,
      props,
      componentContext
    );

    // 최종 변환: InternalTree → UINode
    const root = this.convertToUINode(tree, heuristicsResult.rootNodeType);

    return {
      root,
      props,
      componentType: heuristicsResult.componentType,
      arraySlots,
      ...(heuristicsResult.derivedVars?.length
        ? { derivedVars: heuristicsResult.derivedVars }
        : {}),
    };
  }

  /**
   * 디버그용: InternalTree 반환 (Step 1 결과)
   */
  public buildInternalTreeDebug(node: SceneNode): InternalTree {
    return this.variantMerger.merge(node);
  }

  /**
   * Step 6.5: componentPropertyReferences.characters → bindings.content 처리
   *
   * Figma에서 TEXT 노드에 `componentPropertyReferences.characters`가 있으면
   * 해당 prop을 명시적으로 JSX 바인딩({propName})으로 연결한다.
   * 어느 heuristic이 선택되든 항상 적용되도록 heuristic 실행 후에 처리한다.
   */
  private applyTextPropertyBindings(
    tree: InternalTree,
    props: PropDefinition[]
  ): void {
    this.traverseForTextPropertyBindings(tree, props);
  }

  private traverseForTextPropertyBindings(
    node: InternalTree,
    props: PropDefinition[]
  ): void {
    if (node.type === "TEXT") {
      const charRef = node.componentPropertyReferences?.["characters"];
      if (charRef) {
        const matchedProp = props.find((p) => p.sourceKey === charRef);
        if (matchedProp) {
          if (!node.bindings) {
            node.bindings = {};
          }
          // componentPropertyReferences.characters 바인딩이 우선 (명시적 Figma 선언)
          node.bindings.content = { prop: matchedProp.name };
        }
      }
    }

    for (const child of node.children) {
      this.traverseForTextPropertyBindings(child, props);
    }
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
    let textSegments:
      | Array<{ text: string; style?: Record<string, string> }>
      | undefined;
    if (nodeType === "text") {
      textSegments = this.textProcessor.processTextNode(tree.id);
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
    let nodeType = this.mapToUINodeType(node.type);

    // refId가 없는 INSTANCE는 container로 처리 (dependencies에 없는 경우)
    if (nodeType === "component" && !node.refId) {
      nodeType = "container";
    }

    // component(INSTANCE with refId): 참조하는 dependency에 원본 children이 있으면
    // INSTANCE의 I... children은 불필요하므로 children을 비움
    // 원본 children이 없으면 (empty dependency) I... children이 실제 콘텐츠이므로 유지
    if (nodeType === "component" && node.refId) {
      const depHasOriginalChildren = this.dependencyHasOriginalChildren(
        node.refId
      );
      if (depHasOriginalChildren) {
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
    let textSegments:
      | Array<{ text: string; style?: Record<string, string> }>
      | undefined;
    if (nodeType === "text") {
      textSegments = this.textProcessor.processTextNode(node.id);
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
      ...(node.loop ? { loop: node.loop } : {}),
      ...(nodeType === "component" && node.refId ? { refId: node.refId } : {}),
      ...(nodeType === "vector" && vectorSvg ? { vectorSvg } : {}),
      ...(nodeType === "text" && textSegments ? { textSegments } : {}),
    } as UINode;
  }

  /**
   * dependency 컴포넌트가 원본(non-I) children을 가지는지 확인
   */
  private dependencyHasOriginalChildren(refId: string): boolean {
    const depData = this.dataManager.getById(refId);
    if (!depData.spec) return false;
    const depChildren = depData.spec.info?.document?.children || [];
    return depChildren.some((c: any) => c.id && !c.id.startsWith("I"));
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
