import { InternalNode, ConditionNode, StyleObject } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * ExternalRefsProcessor
 *
 * 외부 참조 처리:
 * 1. INSTANCE 노드 → refId 설정
 * 2. 의존 컴포넌트 Vector SVG 주입 (DataManager 정규화 데이터 사용)
 */
export class ExternalRefsProcessor {
  private readonly dataManager: DataManager;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * 외부 참조 해결 (재귀)
   */
  public resolveExternalRefs(node: InternalNode, isRoot: boolean = true): InternalNode {
    // INSTANCE 노드면 refId 설정
    const refId = this.extractRefId(node);

    // Vector-only 의존성: 컴포넌트 참조 대신 merged SVG 인라인
    // 개별 VECTOR 노드 컴파일은 CSS(COMPONENT 스케일)/SVG(INSTANCE 스케일) 불일치 발생
    // merged SVG는 INSTANCE 좌표계로 통일되어 정확한 렌더링 보장
    if (refId && !isRoot && this.isVectorOnlyDependency(refId)) {
      const mergeResult = this.tryMergeInstanceVectorsWithColorMap(node);
      if (mergeResult) {
        const { svg, colorMap } = mergeResult;

        // wrapper 노드의 styles에 variant별 color CSS 추가
        const wrapperStyles = this.buildColorStyles(node, colorMap);

        return {
          ...node,
          // refId 없음 → container로 렌더링
          ...(wrapperStyles ? { styles: wrapperStyles } : {}),
          children: [{
            id: `${node.id}_merged_vector`,
            name: "Merged Vector",
            type: "VECTOR",
            parent: node,
            children: [],
            metadata: { vectorSvg: svg },
            styles: { base: { width: "100%", height: "100%" }, dynamic: [] },
          }],
        };
      }
    }

    // children 재귀 처리 (children은 root가 아님)
    let children = node.children.map((child) =>
      this.resolveExternalRefs(child, false)
    );

    // 루트 노드이고 children이 비어있으면 merged Vector SVG 확인
    if (isRoot && children.length === 0) {
      const vectorChild = this.createMergedVectorChild(node.id);
      if (vectorChild) {
        children = [vectorChild];
      }
    }

    // v1 호환: INSTANCE 노드의 이름을 dependency의 ComponentSet 이름으로 변경
    // INSTANCE 이름 "Plus"가 아닌, dependency 이름 "Theme=Line" → "Themeline" 사용
    let name = node.name;
    if (refId) {
      const depName = this.resolveDependencyName(refId);
      if (depName) {
        name = depName;
      }
    }

    return {
      ...node,
      name,
      ...(refId ? { refId } : {}),
      children,
    };
  }

  /**
   * INSTANCE 노드의 componentId 추출
   * dependencies에 있는 INSTANCE만 외부 참조로 처리
   */
  private extractRefId(node: InternalNode): string | undefined {
    // INSTANCE 타입이 아니면 무시
    if (node.type !== "INSTANCE") {
      return undefined;
    }

    // mergedNodes가 없으면 무시
    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return undefined;
    }

    // 첫 번째 mergedNode의 id로 원본 SceneNode 가져오기
    const firstMergedId = node.mergedNodes[0].id;
    const { node: sceneNode } = this.dataManager.getById(firstMergedId);

    if (!sceneNode) {
      return undefined;
    }

    // componentId 추출
    const componentId = (sceneNode as any).componentId as string | undefined;

    // dependencies에 없으면 외부 참조로 처리하지 않음 (v1 호환)
    if (!componentId || !this.dataManager.getAllDependencies().has(componentId)) {
      return undefined;
    }

    return componentId;
  }

  /**
   * v1 호환: dependency의 ComponentSet 이름 결정
   *
   * 우선순위 (v1 InstanceProcessor.buildExternalRef 참고):
   * 1. componentSets[componentSetId].name (ComponentSet 이름)
   * 2. document.name (dependency 문서 이름)
   * 3. null (원래 INSTANCE 이름 유지)
   */
  private resolveDependencyName(componentId: string): string | null {
    const depSpec = this.dataManager.getAllDependencies().get(componentId);
    if (!depSpec) return null;

    // ComponentSet 이름 우선
    const componentInfo = depSpec.info.components?.[componentId] as
      | { componentSetId?: string }
      | undefined;
    const componentSetId = componentInfo?.componentSetId;

    if (componentSetId) {
      const componentSetInfo = depSpec.info.componentSets?.[componentSetId] as
        | { name?: string }
        | undefined;
      if (componentSetInfo?.name) {
        return componentSetInfo.name;
      }
    }

    // ComponentSet 이름이 없으면 document.name
    return depSpec.info.document?.name || null;
  }

  // ===========================================================================
  // Vector-only dependency helpers
  // ===========================================================================

  private static readonly VECTOR_LEAF_TYPES = new Set([
    "VECTOR", "LINE", "ELLIPSE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
  ]);

  private static readonly CONTAINER_TYPES = new Set([
    "FRAME", "GROUP", "COMPONENT", "COMPONENT_SET",
  ]);

  private isVectorOnlyDependency(componentId: string): boolean {
    const depSpec = this.dataManager.getAllDependencies().get(componentId);
    const doc = depSpec?.info?.document;
    return doc ? this.hasOnlyVectorLeaves(doc) : false;
  }

  private hasOnlyVectorLeaves(node: any): boolean {
    if (ExternalRefsProcessor.VECTOR_LEAF_TYPES.has(node.type)) return true;
    if (ExternalRefsProcessor.CONTAINER_TYPES.has(node.type)) {
      const children = node.children;
      if (!children || children.length === 0) return true;
      return children.every((c: any) => this.hasOnlyVectorLeaves(c));
    }
    return false;
  }

  /**
   * 모든 variant의 SVG를 수집하여 색상 비교 후 currentColor 치환.
   *
   * 1. 모든 variant SVG 수집
   * 2. variant 간 달라지는 stroke/fill → currentColor 치환
   * 3. 상수 색상 유지
   * 4. variant별 원래 색상 맵 반환
   */
  private tryMergeInstanceVectorsWithColorMap(
    node: InternalNode
  ): { svg: string; colorMap: Map<string, string> } | undefined {
    const mergedNodes = node.mergedNodes || [];
    if (mergedNodes.length === 0) return undefined;

    // 1. 모든 variant의 SVG 수집: variantName → svg
    const variantSvgs = new Map<string, string>();
    for (const m of mergedNodes) {
      const svg = this.dataManager.mergeInstanceVectorSvgs(m.id);
      if (svg) {
        variantSvgs.set(m.variantName || m.name, svg);
      }
    }

    if (variantSvgs.size === 0) return undefined;

    // variant가 1개면 색상 비교 불필요, 그냥 반환
    if (variantSvgs.size === 1) {
      const [, svg] = [...variantSvgs.entries()][0];
      return { svg, colorMap: new Map() };
    }

    // 2. variant 간 색상 비교 → 달라지는 색상 감지
    const colorPattern = /(stroke|fill)="(#[0-9A-Fa-f]{3,8})"/g;

    // 각 variant에서 모든 stroke/fill 색상값 수집 (속성+값 쌍)
    // key: "stroke:#050506" 형태로 추적
    const variantColorSets = new Map<string, Map<string, string>>(); // variantName → (attrKey → color)
    for (const [variantName, svg] of variantSvgs) {
      const colors = new Map<string, string>();
      // 각 속성의 첫 번째 등장 색상을 추적 (같은 속성이 여러 path에 있으면 첫 번째 기준)
      const seen = new Set<string>();
      for (const match of svg.matchAll(colorPattern)) {
        const attr = match[1]; // "stroke" or "fill"
        if (!seen.has(attr)) {
          seen.add(attr);
          colors.set(attr, match[2]); // attr → color
        }
      }
      variantColorSets.set(variantName, colors);
    }

    // 3. 속성별로 모든 variant에서 같은 값인지 비교
    const allAttrs = new Set<string>();
    for (const colors of variantColorSets.values()) {
      for (const attr of colors.keys()) {
        allAttrs.add(attr);
      }
    }

    const varyingAttrs = new Set<string>(); // variant마다 다른 속성
    for (const attr of allAttrs) {
      const values = new Set<string>();
      for (const colors of variantColorSets.values()) {
        const val = colors.get(attr);
        if (val) values.add(val);
      }
      if (values.size > 1) {
        varyingAttrs.add(attr);
      }
    }

    // 변하는 색상이 없으면 첫 번째 SVG 그대로 반환
    if (varyingAttrs.size === 0) {
      const [, svg] = [...variantSvgs.entries()][0];
      return { svg, colorMap: new Map() };
    }

    // 4. 첫 번째 variant의 SVG에서 변하는 속성만 currentColor로 치환
    const [firstVariantName] = [...variantSvgs.keys()];
    let baseSvg = variantSvgs.get(firstVariantName)!;

    for (const attr of varyingAttrs) {
      // 해당 속성의 모든 색상값을 currentColor로 치환
      // fill="none"은 제외 (SVG wrapper 기본값)
      const attrPattern = new RegExp(`${attr}="(#[0-9A-Fa-f]{3,8})"`, "g");
      baseSvg = baseSvg.replace(attrPattern, `${attr}="currentColor"`);
    }

    // 5. variant별 원래 색상 맵 구축 (첫 번째 변하는 속성 기준)
    const colorMap = new Map<string, string>(); // variantName → original color
    const primaryAttr = [...varyingAttrs][0]; // 첫 번째 변하는 속성
    for (const [variantName, colors] of variantColorSets) {
      const color = colors.get(primaryAttr);
      if (color) {
        colorMap.set(variantName, color);
      }
    }

    return { svg: baseSvg, colorMap };
  }

  /**
   * variant별 색상 맵 → wrapper 노드의 StyleObject 생성
   *
   * - 첫 번째 variant 색상 → base.color
   * - 나머지 → dynamic entries (condition + { color })
   * - State prop (hover/active 등)은 condition에서 제외 (pseudo-class로 처리됨)
   */
  private buildColorStyles(
    node: InternalNode,
    colorMap: Map<string, string>
  ): StyleObject | undefined {
    if (colorMap.size === 0) return undefined;

    const existingStyles = node.styles || { base: {}, dynamic: [] };

    // 같은 색상끼리 그룹핑
    const colorGroups = new Map<string, string[]>(); // color → variantName[]
    for (const [variantName, color] of colorMap) {
      if (!colorGroups.has(color)) {
        colorGroups.set(color, []);
      }
      colorGroups.get(color)!.push(variantName);
    }

    // 첫 번째 variant의 색상 → base
    const firstVariantName = [...colorMap.keys()][0];
    const baseColor = colorMap.get(firstVariantName)!;

    const dynamicEntries: Array<{ condition: ConditionNode; style: Record<string, string | number> }> = [];

    // 나머지 색상 그룹 → dynamic entries
    for (const [color, variantNames] of colorGroups) {
      if (color === baseColor) continue;

      for (const variantName of variantNames) {
        const condition = this.createConditionFromVariantName(variantName);
        if (condition) {
          dynamicEntries.push({ condition, style: { color } });
        }
      }
    }

    return {
      ...existingStyles,
      base: { ...existingStyles.base, color: baseColor },
      dynamic: [...(existingStyles.dynamic || []), ...dynamicEntries],
    };
  }

  // ===========================================================================
  // Variant condition helpers (StyleProcessor 패턴 참고)
  // ===========================================================================

  /** CSS pseudo-class로 변환되는 State 값 (condition에서 제외) */
  private static readonly STATE_PSEUDO_VALUES = new Set([
    "hover", "hovered", "hovering",
    "active", "pressed", "pressing", "clicked",
    "focus", "focused", "focus-visible",
    "disabled", "inactive",
  ]);

  /**
   * variant 이름 → ConditionNode 생성
   * State prop 중 pseudo-class 대상 값은 제외
   */
  private createConditionFromVariantName(variantName: string): ConditionNode | null {
    const props = this.parseVariantName(variantName);
    if (props.length === 0) return null;

    const conditions: ConditionNode[] = [];

    for (const { key, value } of props) {
      // State/states prop 중 pseudo-class 대상은 제외
      if (key.toLowerCase() === "state" || key.toLowerCase() === "states") {
        if (ExternalRefsProcessor.STATE_PSEUDO_VALUES.has(value.toLowerCase())) {
          continue;
        }
      }

      conditions.push(this.createCondition(key, value));
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];

    return { type: "and", conditions };
  }

  /**
   * variant 이름 파싱
   * "Color=blue, Size=small" → [{key: "Color", value: "blue"}, {key: "Size", value: "small"}]
   */
  private parseVariantName(variantName: string): Array<{ key: string; value: string }> {
    const result: Array<{ key: string; value: string }> = [];
    const parts = variantName.split(",");

    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (key && value) {
        result.push({ key, value });
      }
    }

    return result;
  }

  /**
   * prop 조건 노드 생성
   */
  private createCondition(key: string, value: string): ConditionNode {
    const propName = this.normalizePropName(key);

    if (value.toLowerCase() === "true") {
      return { type: "truthy", prop: propName };
    }
    if (value.toLowerCase() === "false") {
      return { type: "not", condition: { type: "truthy", prop: propName } };
    }

    return { type: "eq", prop: propName, value };
  }

  /**
   * Prop 이름 정규화 (camelCase 변환)
   */
  private normalizePropName(key: string): string {
    const cleaned = key.replace(/[^a-zA-Z0-9\s]/g, " ").trim();

    let propName = cleaned
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) => {
        if (index === 0) {
          return word.charAt(0).toLowerCase() + word.slice(1);
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join("");

    if (!propName) propName = "prop";

    return propName;
  }

  /**
   * 의존 컴포넌트의 병합된 Vector SVG를 InternalNode로 생성
   * DataManager가 정규화한 데이터 사용
   */
  private createMergedVectorChild(componentId: string): InternalNode | null {
    // DataManager에서 정규화된 병합 SVG 가져오기
    const mergedSvg = this.dataManager.getMergedVectorSvgForComponent(componentId);
    if (!mergedSvg) {
      return null;
    }

    // Vector InternalNode 생성 (SVG를 metadata에 직접 저장)
    return {
      id: `${componentId}_vector`,
      name: "Merged Vector",
      type: "VECTOR",
      parent: null,
      children: [],
      metadata: {
        vectorSvg: mergedSvg,  // 직접 전달
      },
      styles: { base: {}, dynamic: [] },
    };
  }
}
