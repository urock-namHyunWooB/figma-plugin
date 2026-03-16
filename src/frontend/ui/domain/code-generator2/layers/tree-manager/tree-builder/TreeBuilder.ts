import {
  UITree,
  InternalTree,
  PropDefinition,
  ConditionNode,
} from "../../../types/types";
import DataManager from "../../data-manager/DataManager";
import { VariantMerger } from "./processors/VariantMerger";
import { PropsExtractor } from "./processors/PropsExtractor";
import { SlotProcessor } from "./processors/SlotProcessor";
import { StyleProcessor } from "./processors/StyleProcessor";
import { VisibilityProcessor } from "./processors/VisibilityProcessor";
import { ExternalRefsProcessor } from "./processors/ExternalRefsProcessor";
import { HeuristicsRunner } from "./heuristics/HeuristicsRunner";
import { ModuleHeuristic } from "./heuristics/module-heuristics/ModuleHeuristic";
import UINodeConverter from "./UINodeConverter";
import { detectInstanceOverrides } from "./processors/utils/overrideUtils";
import { convertStateDynamicToPseudo, rewritePropConditions } from "./processors/utils/rewritePropConditions";


/**
 * TreeBuilder
 *
 * FigmaNodeData → UITree 변환 파이프라인 오케스트레이터
 *
 * 2-Phase 파이프라인:
 *
 * Phase 1 — 구조 확정 (스타일 미접근):
 *   1. 변형 병합 (VariantMerger)
 *   2. Props 추출/바인딩 (PropsExtractor)
 *   3. Slot 처리 (SlotProcessor)
 *   4. 가시성 조건 (VisibilityProcessor)
 *   5. 외부 참조 — 구조 (ExternalRefsProcessor.resolveStructure)
 *
 * Phase 2 — 스타일 + 후처리 (구조 확정 후):
 *   6. 스타일 처리 (StyleProcessor)
 *   7. 외부 참조 — 색상 (ExternalRefsProcessor.applyColorStyles)
 *   8. Override 감지 / 텍스트 바인딩
 *   9. 모듈 휴리스틱 (ModuleHeuristic)
 *  10. 컴포넌트 휴리스틱 (HeuristicsRunner)
 *  11. State fallback
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
    // =====================================================================
    // Phase 1: 구조 확정 (스타일 미접근)
    // =====================================================================

    // Step 1: 변형 병합
    let tree = this.variantMerger.merge(node);

    // Step 2: Props 추출/바인딩 (mergedNodes 전달하여 variant props 추출)
    let props = this.propsExtractor.extract(node, tree.mergedNodes);

    // Step 3: Slot 처리 (통합: 개별 slot + 배열 slot)
    const slotResult = this.slotProcessor.process(tree, props);
    props = slotResult.props;
    let arraySlots = slotResult.arraySlots;

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

    // Step 5: 외부 참조 — 구조 변환 (INSTANCE → vector wrapper, refId 설정)
    // colorMap은 metadata에 저장만 하고 스타일은 미접근
    tree = this.externalRefsProcessor.resolveStructure(tree);

    // =====================================================================
    // Phase 2: 스타일 + 후처리 (구조 확정 후)
    // =====================================================================

    // Step 6: 스타일 처리 (구조 확정 상태에서 실행 → vector wrapper의 width/height 정상 계산)
    tree = this.styleProcessor.applyStyles(tree);

    // Step 7: 외부 참조 — 색상 스타일 (StyleProcessor가 width/height 계산 완료 후)
    // metadata.vectorColorMap → styles.color dynamic 적용
    tree = this.externalRefsProcessor.applyColorStyles(tree);

    // Step 8: INSTANCE override 감지 + 텍스트 바인딩
    this.detectOverrides(tree);
    this.applyTextPropertyBindings(tree, props);

    // Step 9: 모듈 휴리스틱 — breakpoint variant → CSS @media 등
    ModuleHeuristic.run(tree, props);

    // Step 10: 컴포넌트 휴리스틱 (타입 판별, semanticType 설정, props 추가)
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

    // Step 11: State fallback — 휴리스틱이 처리하지 않은 state dynamic → pseudo 자동 변환
    this.fallbackStateToPseudo(tree, props);

    // 휴리스틱이 직접 생성한 arraySlots 병합 + props 추가
    if (heuristicsResult.arraySlots?.length) {
      const existingNames = new Set(props.map((p) => p.name));
      for (const slot of heuristicsResult.arraySlots) {
        if (!existingNames.has(slot.slotName)) {
          props.push({
            name: slot.slotName,
            type: "slot",
            required: false,
            sourceKey: slot.slotName,
            defaultValue: [],
          });
          existingNames.add(slot.slotName);
        }
        arraySlots.push(slot);
      }
    }

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
      ...(heuristicsResult.stateVars?.length
        ? { stateVars: heuristicsResult.stateVars }
        : {}),
    };
  }

  /**
   * 휴리스틱이 처리하지 않은 state dynamic → pseudo-class 자동 변환
   *
   * 휴리스틱이 state prop을 제거했으면 이미 처리된 것이므로 스킵.
   * state prop이 아직 남아있으면 이 fallback이 pseudo 변환을 수행한다.
   */
  private fallbackStateToPseudo(
    tree: InternalTree,
    props: PropDefinition[]
  ): void {
    const stateIdx = props.findIndex(
      (p) => p.sourceKey.toLowerCase() === "state" || p.sourceKey.toLowerCase() === "states"
    );
    if (stateIdx === -1) return;

    const stateProp = props[stateIdx];
    // name은 normalized (camelCase) — condition.prop과 일치
    const removedProp = stateProp.name;

    // 휴리스틱이 이미 state를 처리한 경우 (disabled 바인딩 등) → fallback 스킵
    if (this.hasBindingRef(tree, removedProp)) return;

    const CSS_CONVERTIBLE = StyleProcessor.CSS_CONVERTIBLE_STATES;

    // 항상 변환 가능한 state 값은 pseudo로 변환 (나머지는 dynamic 유지)
    convertStateDynamicToPseudo(tree, removedProp, StyleProcessor.STATE_TO_PSEUDO);

    // visibility 조건에서 CSS-convertible 값만 제거, non-convertible 값은 보존
    const conditionMap: Record<string, ConditionNode> = {};
    if (stateProp.type === "variant" && stateProp.options?.length) {
      for (const opt of stateProp.options) {
        if (!CSS_CONVERTIBLE.has(opt.toLowerCase())) {
          conditionMap[opt] = { type: "eq", prop: removedProp, value: opt };
        }
      }
    }
    rewritePropConditions(tree, removedProp, conditionMap);

    // 모든 옵션이 CSS 변환 가능하면 prop 완전 제거
    if (stateProp.type === "variant" && stateProp.options?.length) {
      const allConvertible = stateProp.options.every(
        (opt) => CSS_CONVERTIBLE.has(opt.toLowerCase())
      );
      if (allConvertible) {
        props.splice(stateIdx, 1);
      }
    } else {
      props.splice(stateIdx, 1);
    }
  }

  /** 트리에서 propName을 참조하는 expr 바인딩이 있는지 확인 */
  private hasBindingRef(tree: InternalTree, propName: string): boolean {
    const re = new RegExp(`\\b${propName}\\b`);
    const walk = (node: InternalTree): boolean => {
      if (node.bindings?.attrs) {
        for (const b of Object.values(node.bindings.attrs)) {
          if ("expr" in b && re.test(b.expr)) return true;
        }
      }
      for (const child of node.children || []) {
        if (walk(child)) return true;
      }
      return false;
    };
    return walk(tree);
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

  /**
   * INSTANCE 노드의 override 감지 (재귀)
   * styles.dynamic을 확인하여 variant 병합이 처리한 속성은 스킵
   */
  private detectOverrides(tree: InternalTree): void {
    if (tree.refId) {
      const overrides = detectInstanceOverrides(tree, this.dataManager);
      if (overrides.length > 0) {
        if (!tree.metadata) tree.metadata = {};
        tree.metadata.instanceOverrides = overrides;
      }
    }
    for (const child of tree.children) {
      this.detectOverrides(child);
    }
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
