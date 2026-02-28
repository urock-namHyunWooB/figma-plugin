import {
  UITree,
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
import UINodeConverter from "./UINodeConverter";

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
  private readonly nodeConverter: UINodeConverter;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.variantMerger = new VariantMerger(dataManager);
    this.propsExtractor = new PropsExtractor(dataManager);
    this.slotProcessor = new SlotProcessor(dataManager);
    this.styleProcessor = new StyleProcessor(dataManager);
    this.visibilityProcessor = new VisibilityProcessor();
    this.externalRefsProcessor = new ExternalRefsProcessor(dataManager);
    this.heuristicsRunner = new HeuristicsRunner();
    this.nodeConverter = new UINodeConverter(dataManager);
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

    // Step 2: Props 추출/바인딩 (mergedNodes 전달하여 variant props 추출)
    let props = this.propsExtractor.extract(node, tree.mergedNodes);

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
    const root = this.nodeConverter.convert(tree, heuristicsResult.rootNodeType);

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
   * componentPropertyReferences.characters → bindings.content 처리
   *
   * TEXT 노드에 componentPropertyReferences.characters가 있으면
   * 해당 prop을 명시적으로 JSX 바인딩({propName})으로 연결한다.
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
          node.bindings.content = { prop: matchedProp.name };
        }
      }
    }

    for (const child of node.children) {
      this.traverseForTextPropertyBindings(child, props);
    }
  }
}

export default TreeBuilder;
