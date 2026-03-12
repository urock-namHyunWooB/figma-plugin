import { InternalNode, ConditionNode, StyleObject } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * ExternalRefsProcessor
 *
 * 외부 참조 처리 (2단계 분리):
 *
 * Phase 1 — resolveStructure (StyleProcessor 이전):
 *   순수 구조 변환만 수행. 스타일 미접근.
 *   - INSTANCE → refId 설정
 *   - Vector-only 의존성 → wrapper + merged SVG child
 *   - colorMap → metadata.vectorColorMap에 저장 (스타일 생성은 Phase 2로 위임)
 *
 * Phase 2 — applyColorStyles (StyleProcessor 이후):
 *   metadata.vectorColorMap을 읽어 styles에 color dynamic 추가.
 *   이 시점엔 StyleProcessor가 width/height를 이미 계산 완료.
 */
export class ExternalRefsProcessor {
  private readonly dataManager: DataManager;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  // ===========================================================================
  // Phase 1: 구조 변환 (StyleProcessor 이전)
  // ===========================================================================

  /**
   * 외부 참조 구조 해결 (재귀)
   * - INSTANCE → refId 설정
   * - Vector-only 의존성 → wrapper + merged SVG child
   * - colorMap은 metadata에만 저장 (스타일 미접근)
   */
  public resolveStructure(node: InternalNode, isRoot: boolean = true): InternalNode {
    const refId = this.extractRefId(node);

    // Vector-only 의존성: wrapper 구조 변환 + colorMap metadata 저장
    if (refId && !isRoot && this.isVectorOnlyDependency(refId)) {
      const mergeResult = this.tryMergeInstanceVectorsWithColorMap(node);
      if (mergeResult) {
        const { svg, colorMap } = mergeResult;

        return {
          ...node,
          // refId 없음 → container로 렌더링
          metadata: {
            ...node.metadata,
            ...(colorMap.size > 0 ? { vectorColorMap: Object.fromEntries(colorMap) } : {}),
          },
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
      this.resolveStructure(child, false)
    );

    // 루트 노드이고 children이 비어있으면 merged Vector SVG 확인
    if (isRoot && children.length === 0) {
      const vectorChild = this.createMergedVectorChild(node.id);
      if (vectorChild) {
        children = [vectorChild];
      }
    }

    // v1 호환: INSTANCE 노드의 이름을 dependency의 ComponentSet 이름으로 변경
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

  // ===========================================================================
  // Phase 2: 색상 스타일 적용 (StyleProcessor 이후)
  // ===========================================================================

  /**
   * metadata.vectorColorMap → styles.color dynamic 적용 (재귀)
   * StyleProcessor가 width/height를 이미 계산한 후 실행
   */
  public applyColorStyles(node: InternalNode): InternalNode {
    const children = node.children.map((child) => this.applyColorStyles(child));

    const colorMapData = node.metadata?.vectorColorMap;
    if (!colorMapData) {
      return children === node.children ? node : { ...node, children };
    }

    const colorMap = new Map(Object.entries(colorMapData));
    const mergedStyles = this.buildColorStyles(node, colorMap);

    // metadata에서 vectorColorMap 제거 (소비 완료)
    const { vectorColorMap: _, ...restMetadata } = node.metadata!;
    const hasMetadata = Object.keys(restMetadata).length > 0;

    return {
      ...node,
      children,
      ...(mergedStyles ? { styles: mergedStyles } : {}),
      metadata: hasMetadata ? restMetadata : undefined,
    };
  }

  // ===========================================================================
  // Shared: refId / dependency helpers
  // ===========================================================================

  /**
   * INSTANCE 노드의 componentId 추출
   * dependencies에 있는 INSTANCE만 외부 참조로 처리
   */
  private extractRefId(node: InternalNode): string | undefined {
    if (node.type !== "INSTANCE") {
      return undefined;
    }

    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return undefined;
    }

    const firstMergedId = node.mergedNodes[0].id;
    const { node: sceneNode } = this.dataManager.getById(firstMergedId);

    if (!sceneNode) {
      return undefined;
    }

    const componentId = (sceneNode as any).componentId as string | undefined;

    if (!componentId || !this.dataManager.getAllDependencies().has(componentId)) {
      return undefined;
    }

    return componentId;
  }

  /**
   * v1 호환: dependency의 ComponentSet 이름 결정
   */
  private resolveDependencyName(componentId: string): string | null {
    const depSpec = this.dataManager.getAllDependencies().get(componentId);
    if (!depSpec) return null;

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
   */
  private tryMergeInstanceVectorsWithColorMap(
    node: InternalNode
  ): { svg: string; colorMap: Map<string, string> } | undefined {
    const mergedNodes = node.mergedNodes || [];
    if (mergedNodes.length === 0) return undefined;

    const variantSvgs = new Map<string, string>();
    for (const m of mergedNodes) {
      const svg = this.dataManager.mergeInstanceVectorSvgs(m.id);
      if (svg) {
        variantSvgs.set(m.variantName || m.name, svg);
      }
    }

    if (variantSvgs.size === 0) return undefined;

    if (variantSvgs.size === 1) {
      const [, svg] = [...variantSvgs.entries()][0];
      return { svg, colorMap: new Map() };
    }

    const colorPattern = /(stroke|fill)="(#[0-9A-Fa-f]{3,8})"/g;

    const variantColorSets = new Map<string, Map<string, string>>();
    for (const [variantName, svg] of variantSvgs) {
      const colors = new Map<string, string>();
      const seen = new Set<string>();
      for (const match of svg.matchAll(colorPattern)) {
        const attr = match[1];
        if (!seen.has(attr)) {
          seen.add(attr);
          colors.set(attr, match[2]);
        }
      }
      variantColorSets.set(variantName, colors);
    }

    const allAttrs = new Set<string>();
    for (const colors of variantColorSets.values()) {
      for (const attr of colors.keys()) {
        allAttrs.add(attr);
      }
    }

    const varyingAttrs = new Set<string>();
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

    if (varyingAttrs.size === 0) {
      const [, svg] = [...variantSvgs.entries()][0];
      return { svg, colorMap: new Map() };
    }

    const [firstVariantName] = [...variantSvgs.keys()];
    let baseSvg = variantSvgs.get(firstVariantName)!;

    for (const attr of varyingAttrs) {
      const attrPattern = new RegExp(`${attr}="(#[0-9A-Fa-f]{3,8})"`, "g");
      baseSvg = baseSvg.replace(attrPattern, `${attr}="currentColor"`);
    }

    const colorMap = new Map<string, string>();
    const primaryAttr = [...varyingAttrs][0];
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

    const colorGroups = new Map<string, string[]>();
    for (const [variantName, color] of colorMap) {
      if (!colorGroups.has(color)) {
        colorGroups.set(color, []);
      }
      colorGroups.get(color)!.push(variantName);
    }

    const firstVariantName = [...colorMap.keys()][0];
    const baseColor = colorMap.get(firstVariantName)!;

    const dynamicEntries: Array<{ condition: ConditionNode; style: Record<string, string | number> }> = [];

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
  // Variant condition helpers
  // ===========================================================================

  /** CSS pseudo-class로 변환되는 State 값 (condition에서 제외) */
  private static readonly STATE_PSEUDO_VALUES = new Set([
    "hover", "hovered", "hovering",
    "active", "pressed", "pressing", "clicked",
    "focus", "focused", "focus-visible",
    "disabled", "inactive",
  ]);

  private createConditionFromVariantName(variantName: string): ConditionNode | null {
    const props = this.parseVariantName(variantName);
    if (props.length === 0) return null;

    const conditions: ConditionNode[] = [];

    for (const { key, value } of props) {
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
   */
  private createMergedVectorChild(componentId: string): InternalNode | null {
    const mergedSvg = this.dataManager.getMergedVectorSvgForComponent(componentId);
    if (!mergedSvg) {
      return null;
    }

    return {
      id: `${componentId}_vector`,
      name: "Merged Vector",
      type: "VECTOR",
      parent: null,
      children: [],
      metadata: {
        vectorSvg: mergedSvg,
      },
      styles: { base: {}, dynamic: [] },
    };
  }
}
