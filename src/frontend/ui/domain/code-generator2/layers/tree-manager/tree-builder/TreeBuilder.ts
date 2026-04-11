import {
  UITree,
  InternalTree,
  InternalNode,
  PropDefinition,
  ConditionNode,
} from "../../../types/types";
import DataManager from "../../data-manager/DataManager";
import { VariantMerger } from "./processors/variant-merger";
import { stripInteractionLayers } from "./processors/InteractionLayerStripper";
import { collapseRedundantNodes } from "./processors/RedundantNodeCollapser";
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
import { DesignPatternDetector } from "./processors/DesignPatternDetector";


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
  private readonly designPatternDetector: DesignPatternDetector;

  /** InteractionLayerStripper가 제거한 INSTANCE의 componentId 집합 */
  private _strippedInteractionComponentIds = new Set<string>();
  get strippedInteractionComponentIds(): ReadonlySet<string> {
    return this._strippedInteractionComponentIds;
  }

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.variantMerger = new VariantMerger(dataManager);
    this.propsExtractor = new PropsExtractor(dataManager);
    this.slotProcessor = new SlotProcessor(dataManager);
    this.styleProcessor = new StyleProcessor(dataManager);
    this.visibilityProcessor = new VisibilityProcessor(dataManager);
    this.externalRefsProcessor = new ExternalRefsProcessor(dataManager);
    this.heuristicsRunner = new HeuristicsRunner();
    this.nodeConverter = new UINodeConverter(dataManager);
    this.designPatternDetector = new DesignPatternDetector(dataManager);
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

    // Step 1.0: 디자인 패턴 감지 (annotation 부착)
    this.designPatternDetector.detect(tree);

    // Step 1.1: Interaction layer 메타데이터 제거 (Phase 3)
    // — Figma의 "Interaction" frame은 디자이너 의도 표현용 메타데이터이므로
    //   트리에서 제거하고 디자이너 의도 색은 부모의 :hover/:active 등으로 흡수.
    // — 제거된 INSTANCE의 componentId를 수집하여 dependency 정리에 사용.
    this._strippedInteractionComponentIds = stripInteractionLayers(tree, this.dataManager);

    // Step 1.2: 불필요한 노드 제거 (최적화)
    // — 풀커버 배경 노드 흡수 + 유일한 자식 래퍼 합침
    collapseRedundantNodes(tree, this.dataManager);

    // Step 1.5: 다른 componentId가 prop에 의해 제어되는 INSTANCE → 분리
    this.splitMultiComponentInstances(tree);

    // Step 2: Props 추출/바인딩 (mergedNodes 전달하여 variant props 추출)
    let props = this.propsExtractor.extract(node, tree.mergedNodes);

    // Step 2.5: prop 레벨 디자인 패턴 감지 (statePseudoClass, breakpointVariant)
    this.designPatternDetector.detect(tree, props);

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

    // Step 10.5: loop 컨테이너의 템플릿에 itemVariant 스타일 적용
    this.applyLoopItemVariants(tree);

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
   * loop 컨테이너의 템플릿 노드에 itemVariant 스타일 적용 (재귀)
   *
   * loop가 설정된 컨테이너의 첫 번째 자식(템플릿)에 대해
   * dependency boolean variant 스타일 차이를 추출
   */
  private applyLoopItemVariants(node: InternalTree): void {
    if (node.loop && node.children.length > 0) {
      const template = node.children[0];
      const result = this.styleProcessor.applyLoopItemVariant(template);
      if (result) {
        node.children[0] = result;
      }
    }
    for (const child of node.children) {
      this.applyLoopItemVariants(child);
    }
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
    const statePattern = tree.metadata?.designPatterns?.find(
      (p): p is Extract<import("../../../../types/types").DesignPattern, { type: "statePseudoClass" }> =>
        p.type === "statePseudoClass"
    );
    if (!statePattern) return;
    const stateIdx = props.findIndex((p) => p.name === statePattern.prop);
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
   * 합쳐진 INSTANCE에서 다른 componentId가 prop에 의해 제어되면 분리.
   *
   * 예: Tagreview에서 Forbid/Time/Success/Info/Error가 하나로 합쳐졌는데,
   * state prop에 따라 다른 컴포넌트 → 분리하여 component map 패턴 유지.
   *
   * 반면 Chips에서 icon-checking/icon_checking은 size에 따른 같은 역할
   * → 모든 variant가 같은 컴포넌트(이름만 다름)이므로 분리 안 함.
   */
  private splitMultiComponentInstances(tree: InternalNode): void {
    for (let i = 0; i < tree.children.length; i++) {
      const child = tree.children[i];

      // 재귀
      this.splitMultiComponentInstances(child);

      if (child.type !== "INSTANCE") continue;
      if (!child.mergedNodes || child.mergedNodes.length <= 1) continue;

      // mergedNodes에서 variant별 componentId 수집
      const variantCompMap = new Map<string, Set<string>>(); // componentName → variantNames
      const compNameById = new Map<string, string>(); // componentId → componentName
      for (const m of child.mergedNodes) {
        const { node: origNode } = this.dataManager.getById(m.id);
        const compId = (origNode as any)?.componentId;
        if (!compId) continue;
        const compName = (origNode as any)?.name || compId;
        compNameById.set(compId, compName);
        if (!variantCompMap.has(compName)) variantCompMap.set(compName, new Set());
        if (m.variantName) variantCompMap.get(compName)!.add(m.variantName);
      }

      // 모든 variant가 같은 componentName이면 분리 불필요
      if (variantCompMap.size <= 1) continue;

      // 어떤 prop이 componentId를 제어하는지 찾기
      const controllingProp = this.findControllingPropForComponent(child.mergedNodes as any, variantCompMap);
      if (!controllingProp) continue;

      // controlling prop이 variant root 크기도 변경하는 prop이면 분리하지 않음
      // (예: size prop이 전체 크기를 바꾸면서 아이콘도 바뀌는 경우 → 같은 역할)
      if (this.isPropChangingRootSize(child.mergedNodes as any, controllingProp)) continue;

      // 분리: componentName별로 새 INSTANCE 노드 생성
      const newNodes: InternalNode[] = [];
      for (const [compName, variantNames] of variantCompMap) {
        const filteredMerged = child.mergedNodes.filter((m) => {
          const { node: n } = this.dataManager.getById(m.id);
          return (n as any)?.name === compName;
        });

        // prop value 추출 (variant 이름에서)
        const propValues = new Set<string>();
        for (const vn of variantNames) {
          const match = vn.match(new RegExp(`${controllingProp}=([^,]+)`, "i"));
          if (match) propValues.add(match[1].trim());
        }

        const newNode: InternalNode = {
          ...child,
          id: child.id + "_" + compName,
          name: compName,
          mergedNodes: filteredMerged,
          children: child.children.map((c) => ({ ...c })),
          visibleCondition: propValues.size === 1
            ? { type: "eq" as const, prop: controllingProp, value: [...propValues][0] }
            : undefined,
        };
        newNode.parent = tree;
        newNodes.push(newNode);
      }

      // 원본 child를 새 노드들로 교체
      tree.children.splice(i, 1, ...newNodes);
      i += newNodes.length - 1; // 인덱스 보정
    }
  }

  /**
   * mergedNodes에서 componentName 변화를 제어하는 prop 찾기.
   * 특정 prop 값이 바뀔 때만 componentName이 바뀌면 그 prop이 제어.
   */
  private findControllingPropForComponent(
    mergedNodes: Array<{ id: string; name: string; variantName: string; variantProps?: Record<string, string> }>,
    variantCompMap: Map<string, Set<string>>
  ): string | null {
    // variant 이름에서 prop 추출
    const allProps = new Map<string, Set<string>>();
    for (const m of mergedNodes) {
      const pairs = m.variantName.split(",").map((p) => p.trim().split("="));
      for (const [key, val] of pairs) {
        if (key && val) {
          if (!allProps.has(key)) allProps.set(key, new Set());
          allProps.get(key)!.add(val);
        }
      }
    }

    // 각 prop에 대해: prop 값이 같으면 componentName도 같은지 확인
    for (const [propName, propValues] of allProps) {
      if (propValues.size <= 1) continue;

      let isControlling = true;
      const propToComp = new Map<string, string>();

      for (const m of mergedNodes) {
        const match = m.variantName.match(new RegExp(`${propName}=([^,]+)`, "i"));
        if (!match) { isControlling = false; break; }
        const propVal = match[1].trim();

        const { node: origNode } = this.dataManager.getById(m.id);
        const compName = (origNode as any)?.name || "";

        if (propToComp.has(propVal)) {
          if (propToComp.get(propVal) !== compName) {
            // 같은 prop 값인데 다른 componentName → 이 prop이 아님
            isControlling = false;
            break;
          }
        } else {
          propToComp.set(propVal, compName);
        }
      }

      // prop 값 → componentName이 1:1 매핑이면 제어 prop
      if (isControlling && propToComp.size === propValues.size) {
        const compNames = new Set(propToComp.values());
        if (compNames.size > 1) return propName;
      }
    }

    return null;
  }

  /**
   * controlling prop 값이 바뀌면 variant root 크기도 바뀌는지 확인.
   * size prop처럼 전체 크기를 제어하는 prop이면 true → component 분리 불필요.
   */
  private isPropChangingRootSize(
    mergedNodes: Array<{ id: string; variantName: string }>,
    propName: string
  ): boolean {
    // 각 prop value별 height 집합 수집
    const heightsByPropValue = new Map<string, Set<number>>();
    for (const m of mergedNodes) {
      const match = m.variantName.match(new RegExp(`${propName}=([^,]+)`, "i"));
      if (!match) continue;
      const propVal = match[1].trim();

      const variantRootId = this.variantMerger.nodeToVariantRoot.get(m.id);
      if (!variantRootId) continue;
      const { node: root } = this.dataManager.getById(variantRootId);
      const bounds = (root as any)?.absoluteBoundingBox;
      if (!bounds) continue;

      if (!heightsByPropValue.has(propVal)) heightsByPropValue.set(propVal, new Set());
      heightsByPropValue.get(propVal)!.add(Math.round(bounds.height));
    }

    if (heightsByPropValue.size < 2) return false;

    // 모든 prop value의 height 집합이 동일하면 → 이 prop은 height를 변경하지 않음
    // (다른 prop, 예: Size가 height를 변경하는 것)
    const sets = [...heightsByPropValue.values()];
    const first = [...sets[0]].sort().join(",");
    const allSame = sets.every(s => [...s].sort().join(",") === first);
    return !allSame;
  }

  /**
   * 디버그용: InternalTree 반환 (Step 1 + 1.1 결과 — VariantMerger + Interaction strip)
   *
   * @param options.skipInteractionStripper true이면 Interaction layer strip을 건너뛴다.
   *   merger가 만든 raw tree를 관찰할 때 사용 (cross-parent 매칭 버그 조사 등).
   */
  public buildInternalTreeDebug(
    node: SceneNode,
    options?: { skipInteractionStripper?: boolean }
  ): InternalTree {
    const tree = this.variantMerger.merge(node);
    this.designPatternDetector.detect(tree);
    if (!options?.skipInteractionStripper) {
      stripInteractionLayers(tree, this.dataManager);
    }
    return tree;
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
