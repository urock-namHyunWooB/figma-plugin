import {
  ConditionNode,
  DynamicVariants,
  StyleObject,
  TempAstTree,
} from "@compiler";
import { BinaryOperator } from "@compiler/types/customType";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { traverseBFS } from "@compiler/utils/traverse";
import { diff } from "deep-object-diff";

// ============================================================
// Type Definitions
// ============================================================

/** CSS 스타일 객체 */
type CssStyle = Record<string, string>;

/** Variant props (예: { size: "Large", state: "Default" }) */
type VariantProps = Record<string, string>;

/** Variant ID와 props 매핑 */
type VariantPropsById = Record<string, VariantProps>;

/** 스타일이 포함된 Variant 아이템 */
type VariantItem = {
  id: string;
  variant: VariantProps;
  css: CssStyle;
  name: string;
};

/** 디자이너 피드백 리포트 */
type DesignFeedback = {
  cssKey: string;
  type: "MISSING_PROP" | "VALUE_MISMATCH";
  message: string;
  itemIds: string[];
  itemNames: string[];
};

/** CSS 값별 통계 정보 */
type CssValueStatistics = {
  count: number;
  ids: string[];
  names: string[];
  originalValue: string;
};

/** Variant 그룹 (같은 fixed props를 가진 아이템들의 묶음) */
type VariantGroup = {
  varyKey: string;
  fixedProps: VariantProps;
  items: Array<{ id: string; props: VariantProps }>;
};

/** 스타일 추출 결과 */
type ExtractedStyleResult = {
  baseStyle: CssStyle;
  dynamicItems: VariantItem[];
  feedbacks: DesignFeedback[];
};

/** CSS 키 분석 결과 */
type CssKeyAnalysis = {
  statisticsByValue: Record<string, CssValueStatistics>;
  missingItemIds: string[];
  missingItemNames: string[];
  sortedStatistics: CssValueStatistics[];
  dominantStatistics: CssValueStatistics | undefined;
  dominantCount: number;
  dominantValue: string;
};

// ============================================================
// Helper Functions (순수 함수)
// ============================================================

/** 배열을 키 기준으로 그룹화하여 각 값을 배열로 수집 */
const groupByKey = <T, K extends string>(
  items: T[],
  getKey: (item: T) => K
): Record<K, T[]> =>
  items.reduce(
    (grouped, item) => ({
      ...grouped,
      [getKey(item)]: [...(grouped[getKey(item)] ?? []), item],
    }),
    {} as Record<K, T[]>
  );

/** 배열을 키 기준으로 그룹화하고 값을 변환하여 수집 */
const groupByKeyWithTransform = <T, K extends string, V>(
  items: T[],
  getKey: (item: T) => K,
  transform: (item: T) => V
): Record<K, V[]> =>
  items.reduce(
    (grouped, item) => ({
      ...grouped,
      [getKey(item)]: [...(grouped[getKey(item)] ?? []), transform(item)],
    }),
    {} as Record<K, V[]>
  );

// ============================================================
// UpdateStyle Class
// ============================================================

class UpdateStyle {
  private _specDataManager: SpecDataManager;
  private _reports: DesignFeedback[] = [];

  constructor(specDataManager: SpecDataManager) {
    this._specDataManager = specDataManager;
  }

  /**
   * AST 트리의 모든 노드에 최적화된 스타일을 계산하여 할당합니다.
   * 각 노드의 variant들을 분석하여 공통 base 스타일과 dynamic 스타일을 분리합니다.
   */
  public updateStyle(pivotTree: TempAstTree): TempAstTree {
    traverseBFS(pivotTree, (pivotNode) => {
      const itemsWithStyle = this._buildItemsWithStyle(pivotNode.mergedNode);
      const variantPropsById = this._extractVariantPropsOnly(itemsWithStyle);
      const variantGroups = this._groupByVaryKey(variantPropsById);

      const groupsByPropKey = Object.fromEntries(
        Object.keys(pivotTree.props).map((propKey) => [
          propKey,
          variantGroups.filter((group) => group.varyKey === propKey),
        ])
      );

      pivotNode.style = this._computeOptimizedStyle(
        groupsByPropKey,
        itemsWithStyle
      );
    });

    console.log(this._reports);
    return pivotTree;
  }

  // ============================================================
  // Style Building Methods
  // ============================================================

  /** mergedNode 배열에서 각 아이템의 variant props와 CSS 스타일을 추출합니다. */
  private _buildItemsWithStyle(
    mergedNodes: Array<{
      id: string;
      name: string;
      variantName?: string | null;
    }>
  ): Record<string, { css: CssStyle } & VariantProps> {
    return Object.fromEntries(
      mergedNodes.map((node) => {
        const variantProps = this._parseVariantName(
          node.variantName ?? node.name
        );
        const css = this._specDataManager.getRenderTreeById(node.id).cssStyle;
        return [node.id, { ...variantProps, css }] as const;
      })
    ) as Record<string, { css: CssStyle } & VariantProps>;
  }

  /** "size=Large, state=Default" 형식의 문자열을 { size: "Large", state: "Default" } 객체로 파싱합니다. */
  private _parseVariantName(variantName: string): VariantProps {
    const keyValuePairs = variantName
      .split(",")
      .map((pair) => pair.trim())
      .map((pair) => pair.split("=").map((s) => s.trim()))
      .filter(([key, value]) => key && value);

    return Object.fromEntries(keyValuePairs);
  }

  /** 아이템에서 CSS를 제외한 순수 variant props만 추출합니다. */
  private _extractVariantPropsOnly(
    itemsWithStyle: Record<string, { css: CssStyle } & VariantProps>
  ): VariantPropsById {
    return Object.fromEntries(
      Object.entries(itemsWithStyle).map(([id, item]) => {
        const { css: _css, ...variantProps } = item;
        return [id, variantProps as VariantProps];
      })
    );
  }

  // ============================================================
  // Style Computation (선언형)
  // ============================================================

  /** 그룹별 variant를 분석하여 최적화된 StyleObject를 생성합니다. */
  private _computeOptimizedStyle(
    groupsByPropKey: Record<string, VariantGroup[]>,
    itemsWithStyle: Record<string, { css: CssStyle } & VariantProps>
  ): StyleObject {
    const itemsByVaryKey = this._transformGroupsToVariantItems(
      groupsByPropKey,
      itemsWithStyle
    );

    /**
     * TODO
     * 아래의 방법은 하나가 모두 같은 variant를 모아둬서 동일한 css를 추출하는 방법이다.
     * 하지만 이 방법은 하나의 variant가 다른 variant로 인해서 변하지 않는다는 가정하에 성립하는 조건.
     *
     * itemsByVaryKey를 다시 분석해서 base, dynamic을 다시 옳게 구하자.
     */

    const itemsByVariantKey = this._flattenAndGroupByVariantKey(itemsByVaryKey);

    const styleResultByVariant = this._computeStyleResults(itemsByVariantKey);

    // feedbacks 추출해서 _reports에 추가
    for (const result of Object.values(styleResultByVariant)) {
      this._reports.push(...result.feedbacks);
    }

    const optimizedResult = this._optimizeStyles(styleResultByVariant);

    return {
      base: optimizedResult.commonBaseStyle,
      dynamic: this._buildDynamicStyleArray(optimizedResult.dynamicVariants),
    };
  }

  /** DynamicVariants를 StyleObject.dynamic 배열로 변환합니다. */
  private _buildDynamicStyleArray(
    dynamicVariants: DynamicVariants
  ): StyleObject["dynamic"] {
    const result: StyleObject["dynamic"] = [];

    /**
     * TODO
     * 중복된 variant를 삭제해야한다.
     */

    const allItems = Object.values(dynamicVariants).flatMap(
      (entry) => entry.style.dynamic
    );

    for (const item of allItems) {
      // 1. 단일 조건 (item.base가 있을 때)
      if (Object.keys(item.base).length > 0) {
        result.push({
          condition: this._parseVariantCondition(item.variantName),
          style: item.base,
        });
      }

      // 2. 복합 조건 (item.dynamic 각 아이템)
      if (item.dynamic && item.dynamic.length > 0) {
        for (const dynamicItem of item.dynamic) {
          // css가 비어있으면 스킵
          if (!dynamicItem.css || Object.keys(dynamicItem.css).length === 0) {
            continue;
          }

          // name: "size=L, type=outlined_blue, states=default" 파싱
          const compoundCondition = this._parseCompoundCondition(
            dynamicItem.name
          );

          result.push({
            condition: compoundCondition,
            style: dynamicItem.css,
          });
        }
      }
    }

    return result;
  }

  /** "size=L, type=outlined_blue, states=default" 형태의 복합 조건을 AND 조건으로 변환합니다. */
  private _parseCompoundCondition(name: string): ConditionNode {
    const pairs = name
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.includes("="));

    if (pairs.length === 0) {
      // 빈 조건이면 항상 true (Literal true)
      return {
        type: "Literal",
        value: true,
        raw: "true",
      } as ConditionNode;
    }

    if (pairs.length === 1) {
      // 단일 조건
      return this._parseVariantCondition(pairs[0]);
    }

    // 복합 조건: AND로 연결
    const conditions = pairs.map((pair) => this._parseVariantCondition(pair));

    // 조건들을 AND로 연결 (좌결합)
    return conditions.reduce((left, right) => ({
      type: "LogicalExpression",
      operator: "&&",
      left,
      right,
    })) as ConditionNode;
  }

  /** "Size=Large" 형태의 variantName을 ConditionNode AST로 변환합니다. */
  private _parseVariantCondition(variantName: string): ConditionNode {
    const [key, value] = variantName.split("=").map((s) => s.trim());
    return {
      type: "BinaryExpression",
      operator: "===" as BinaryOperator,
      left: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "props" },
        property: { type: "Identifier", name: key },
        computed: false,
        optional: false,
      },
      right: {
        type: "Literal",
        value: value,
        raw: `'${value}'`,
      },
    } as ConditionNode;
  }

  /** VariantGroup들을 varyKey 기준으로 그룹화하고 VariantItem 배열로 변환합니다. */
  private _transformGroupsToVariantItems(
    groupsByPropKey: Record<string, VariantGroup[]>,
    itemsWithStyle: Record<string, { css: CssStyle } & VariantProps>
  ): Record<string, VariantItem[][]> {
    const allGroups = Object.values(groupsByPropKey)
      .flat()
      .filter((group) => group.items.length > 0);

    const groupedByVaryKey = groupByKeyWithTransform(
      allGroups,
      (group) => group.varyKey,
      (group) => this._mapGroupToVariantItems(group, itemsWithStyle)
    );

    return groupedByVaryKey;
  }

  /** VariantGroup의 아이템들을 VariantItem 배열로 매핑합니다. */
  private _mapGroupToVariantItems(
    group: VariantGroup,
    itemsWithStyle: Record<string, { css: CssStyle } & VariantProps>
  ): VariantItem[] {
    return group.items.map((groupItem) => ({
      id: groupItem.id,
      variant: { [group.varyKey]: groupItem.props[group.varyKey] },
      name: this._specDataManager.getSpecById(groupItem.id).name,
      css: itemsWithStyle[groupItem.id]?.css ?? {},
    }));
  }

  /** 중첩된 VariantItem 배열을 평탄화하고 variant key 기준으로 재그룹화합니다. */
  private _flattenAndGroupByVariantKey(
    itemsByVaryKey: Record<string, VariantItem[][]>
  ): Record<string, VariantItem[]> {
    const allVariantItems = Object.values(itemsByVaryKey).flat(2);

    return groupByKey(allVariantItems, (item) =>
      this._serializeVariantProps(item.variant)
    );
  }

  /** 각 variant key에 대해 스타일 추출 결과를 계산합니다. */
  private _computeStyleResults(
    itemsByVariantKey: Record<string, VariantItem[]>
  ): Record<string, ExtractedStyleResult> {
    return Object.fromEntries(
      Object.entries(itemsByVariantKey).map(([variantKey, items]) => [
        variantKey,
        this._extractStyleResult(items),
      ])
    );
  }

  // ============================================================
  // Style Optimization (선언형)
  // ============================================================

  /** 스타일 결과를 최적화하여 공통 base와 varying 스타일을 분리합니다. */
  private _optimizeStyles(
    styleResultByVariant: Record<string, ExtractedStyleResult>
  ): { commonBaseStyle: CssStyle; dynamicVariants: DynamicVariants } {
    const dynamicVariants =
      this._structureDynamicVariants(styleResultByVariant);

    const commonBaseStyle = this._findCommonBaseStyles(styleResultByVariant);

    const optimizedDynamicVariants =
      this._extractVaryingStylesOnly(dynamicVariants);

    return { commonBaseStyle, dynamicVariants: optimizedDynamicVariants };
  }

  /** 스타일 결과를 DynamicVariants 구조로 변환합니다. */
  private _structureDynamicVariants(
    styleResultByVariant: Record<string, ExtractedStyleResult>
  ): DynamicVariants {
    const entries = Object.entries(styleResultByVariant);

    const groupedByPropName = groupByKeyWithTransform(
      entries,
      ([variantKey]) => variantKey.split("=")[0],
      ([variantKey, styleResult]) => ({
        variantName: variantKey,
        base: styleResult.baseStyle,
        dynamic: styleResult.dynamicItems,
        report: styleResult.feedbacks,
      })
    );

    return Object.fromEntries(
      Object.entries(groupedByPropName).map(([propName, dynamicStyles]) => [
        propName,
        { style: { base: {}, dynamic: dynamicStyles } },
      ])
    );
  }

  /** 모든 variant에 공통으로 존재하는 CSS 속성을 추출합니다. */
  private _findCommonBaseStyles(
    styleResultByVariant: Record<string, ExtractedStyleResult>
  ): CssStyle {
    const allStyleResults = Object.values(styleResultByVariant);
    if (allStyleResults.length === 0) return {};

    const firstBaseStyle = allStyleResults[0].baseStyle;

    const commonEntries = Object.entries(firstBaseStyle).filter(
      ([cssKey, cssValue]) =>
        allStyleResults.every((result) => result.baseStyle[cssKey] === cssValue)
    );

    return Object.fromEntries(commonEntries);
  }

  /** DynamicVariants에서 variant 간 실제로 다른 스타일만 남깁니다. */
  private _extractVaryingStylesOnly(
    dynamicVariants: DynamicVariants
  ): DynamicVariants {
    return Object.fromEntries(
      Object.entries(dynamicVariants).map(([propName, variantEntry]) => {
        const commonBase = this._computeVariantBaseStyle(
          variantEntry.style.dynamic
        );
        const commonKeys = Object.keys(commonBase);

        // 각 variant에서 공통 스타일 제거
        const filteredDynamic = variantEntry.style.dynamic.map((style) => ({
          ...style,
          base: Object.fromEntries(
            Object.entries(style.base).filter(
              ([key]) => !commonKeys.includes(key)
            )
          ),
        }));

        return [
          propName,
          {
            style: {
              base: commonBase,
              dynamic: filteredDynamic,
            },
          },
        ];
      })
    );
  }

  /** 모든 variant에 공통으로 존재하는 CSS 속성을 추출합니다. */
  private _computeVariantBaseStyle(
    dynamicStyles: Array<{ base: CssStyle }>
  ): CssStyle {
    if (dynamicStyles.length === 0) return {};
    if (dynamicStyles.length === 1) return dynamicStyles[0].base ?? {};

    // 첫 번째 스타일을 기준으로 모든 variant에 공통인 속성 찾기
    const firstBase = dynamicStyles[0].base;
    const commonEntries = Object.entries(firstBase).filter(
      ([cssKey, cssValue]) =>
        dynamicStyles.every((style) => style.base[cssKey] === cssValue)
    );

    return Object.fromEntries(commonEntries);
  }

  /** variant 간 실제로 값이 다른 CSS 속성만 필터링합니다. */
  private _filterToVaryingStyles(
    dynamicStyles: Array<{
      variantName: string;
      base: CssStyle;
      dynamic: [];
      report: [];
    }>
  ): Array<{ variantName: string; base: CssStyle; dynamic: []; report: [] }> {
    if (dynamicStyles.length <= 1) return dynamicStyles;

    const referenceBase = dynamicStyles[0].base;
    const changedCssKeys = this._findChangedCssKeys(
      referenceBase,
      dynamicStyles
    );

    return dynamicStyles.map((style) => ({
      ...style,
      base: Object.fromEntries(
        changedCssKeys.map((cssKey) => [cssKey, style.base[cssKey]])
      ),
    }));
  }

  /** 기준 base와 비교하여 모든 variant에서 값이 다른 CSS 키를 찾습니다. */
  private _findChangedCssKeys(
    referenceBase: CssStyle,
    dynamicStyles: Array<{ base: CssStyle }>
  ): string[] {
    const diffCounts = dynamicStyles.reduce<Record<string, number>>(
      (counts, style) => {
        const diffResult = diff(referenceBase, style.base);
        return Object.keys(diffResult).reduce(
          (acc, cssKey) => ({
            ...acc,
            [cssKey]: (acc[cssKey] ?? 0) + 1,
          }),
          counts
        );
      },
      {}
    );

    return Object.entries(diffCounts)
      .filter(([_, count]) => count === dynamicStyles.length - 1)
      .map(([cssKey]) => cssKey);
  }

  // ============================================================
  // Variant Grouping (선언형)
  // ============================================================

  /** variant props를 분석하여 단일 vary key 기준으로 그룹화합니다. */
  private _groupByVaryKey(variantPropsById: VariantPropsById): VariantGroup[] {
    const itemIds = Object.keys(variantPropsById);
    if (itemIds.length === 0) return [];

    const allPropKeys = this._collectAllPropKeys(variantPropsById, itemIds);
    const allGroupCandidates = this._generateAllGroupCandidates(
      allPropKeys,
      itemIds,
      variantPropsById
    );

    return this._mergeAndFilterGroups(allGroupCandidates);
  }

  /** 모든 아이템에서 사용된 prop key를 수집합니다 (css 제외). */
  private _collectAllPropKeys(
    variantPropsById: VariantPropsById,
    itemIds: string[]
  ): string[] {
    const allKeys = itemIds.flatMap((id) =>
      Object.keys(variantPropsById[id] ?? {})
    );

    return [...new Set(allKeys)].filter((key) => key !== "css").sort();
  }

  /** 모든 (varyKey, itemId) 조합에 대해 그룹 후보를 생성합니다. */
  private _generateAllGroupCandidates(
    allPropKeys: string[],
    itemIds: string[],
    variantPropsById: VariantPropsById
  ): Array<{ groupKey: string; group: VariantGroup }> {
    return allPropKeys.flatMap((varyKey) =>
      itemIds
        .filter((id) => variantPropsById[id])
        .map((id) =>
          this._createGroupCandidate(
            varyKey,
            id,
            variantPropsById[id],
            allPropKeys
          )
        )
    );
  }

  /** 단일 아이템에 대한 그룹 후보를 생성합니다 (groupKey와 초기 그룹 구조). */
  private _createGroupCandidate(
    varyKey: string,
    itemId: string,
    variantProps: VariantProps,
    allPropKeys: string[]
  ): { groupKey: string; group: VariantGroup } {
    const fixedEntries = allPropKeys
      .filter((key) => key !== varyKey)
      .map((key) => {
        const value = variantProps[key];
        return typeof value === "string" ? ([key, value] as const) : null;
      })
      .filter((entry): entry is [string, string] => entry !== null);

    const fixedProps = Object.fromEntries(fixedEntries) as VariantProps;
    const signature = fixedEntries
      .map(([key, value]) => `${key}=${value}`)
      .join("|");
    const groupKey = `${varyKey}::${signature}`;

    return {
      groupKey,
      group: {
        varyKey,
        fixedProps,
        items: [{ id: itemId, props: variantProps }],
      },
    };
  }

  /** 같은 groupKey를 가진 후보들을 병합하고, 2개 이상의 아이템을 가진 그룹만 반환합니다. */
  private _mergeAndFilterGroups(
    candidates: Array<{ groupKey: string; group: VariantGroup }>
  ): VariantGroup[] {
    const mergedGroups = candidates.reduce<Map<string, VariantGroup>>(
      (groupsMap, { groupKey, group }) => {
        const existing = groupsMap.get(groupKey);
        if (existing) {
          existing.items.push(...group.items);
        } else {
          groupsMap.set(groupKey, { ...group });
        }
        return groupsMap;
      },
      new Map()
    );

    return [...mergedGroups.values()].filter(
      (group) => group.items.length >= 2
    );
  }

  // ============================================================
  // Style Extraction (선언형)
  // ============================================================

  /** 아이템들의 CSS를 분석하여 base 스타일, dynamic 아이템, 피드백을 추출합니다. */
  private _extractStyleResult(items: VariantItem[]): ExtractedStyleResult {
    if (!items || items.length === 0) {
      return { baseStyle: {}, dynamicItems: [], feedbacks: [] };
    }

    const totalCount = items.length;
    const consensusThreshold = this._calculateConsensusThreshold(totalCount);
    const allCssKeys = this._collectAllCssKeys(items);

    const { baseStyle, feedbacks } = this._analyzeAndExtractBase(
      items,
      allCssKeys,
      totalCount,
      consensusThreshold
    );

    const dynamicItems = this._createDynamicItems(items, baseStyle);

    return { baseStyle, dynamicItems, feedbacks };
  }

  /** 아이템 개수에 따른 합의 임계값을 계산합니다 (70% 이상 일치 시 합의). */
  private _calculateConsensusThreshold(totalCount: number): number {
    if (totalCount <= 2) return totalCount;
    if (totalCount === 3) return 2;
    return Math.ceil(totalCount * 0.7);
  }

  /** 모든 아이템에서 사용된 CSS 키를 수집합니다. */
  private _collectAllCssKeys(items: VariantItem[]): string[] {
    return [...new Set(items.flatMap((item) => Object.keys(item.css ?? {})))];
  }

  /** 각 CSS 키를 분석하여 base 스타일과 디자이너 피드백을 추출합니다. */
  private _analyzeAndExtractBase(
    items: VariantItem[],
    allCssKeys: string[],
    totalCount: number,
    consensusThreshold: number
  ): { baseStyle: CssStyle; feedbacks: DesignFeedback[] } {
    const analysisResults = allCssKeys.map((cssKey) => ({
      cssKey,
      analysis: this._analyzeCssKey(items, cssKey),
    }));

    const baseStyle = Object.fromEntries(
      analysisResults
        .filter(({ analysis }) => analysis.dominantCount === totalCount)
        .map(({ cssKey, analysis }) => [cssKey, analysis.dominantValue])
    );

    const feedbacks = analysisResults
      .filter(
        ({ analysis }) =>
          analysis.dominantCount >= consensusThreshold &&
          analysis.dominantCount < totalCount
      )
      .flatMap(({ cssKey, analysis }) =>
        this._generateFeedbacks(cssKey, analysis)
      );

    return { baseStyle, feedbacks };
  }

  /** 특정 CSS 키에 대한 값 분포를 분석합니다 (통계, 누락, 지배적 값 등). */
  private _analyzeCssKey(items: VariantItem[], cssKey: string): CssKeyAnalysis {
    const { statisticsByValue, missingItemIds, missingItemNames } =
      items.reduce<{
        statisticsByValue: Record<string, CssValueStatistics>;
        missingItemIds: string[];
        missingItemNames: string[];
      }>(
        (acc, item) => {
          const cssValue = item.css?.[cssKey];

          if (cssValue === undefined || cssValue === null) {
            return {
              ...acc,
              missingItemIds: [...acc.missingItemIds, item.id],
              missingItemNames: [...acc.missingItemNames, item.name],
            };
          }

          const valueKey = String(cssValue);
          const existing = acc.statisticsByValue[valueKey];

          return {
            ...acc,
            statisticsByValue: {
              ...acc.statisticsByValue,
              [valueKey]: {
                count: (existing?.count ?? 0) + 1,
                ids: [...(existing?.ids ?? []), item.id],
                names: [...(existing?.names ?? []), item.name],
                originalValue: cssValue,
              },
            },
          };
        },
        { statisticsByValue: {}, missingItemIds: [], missingItemNames: [] }
      );

    const sortedStatistics = Object.values(statisticsByValue).sort(
      (a, b) => b.count - a.count
    );
    const dominantStatistics = sortedStatistics[0];

    return {
      statisticsByValue,
      missingItemIds,
      missingItemNames,
      sortedStatistics,
      dominantStatistics,
      dominantCount: dominantStatistics?.count ?? 0,
      dominantValue: dominantStatistics?.originalValue ?? "",
    };
  }

  /** 분석 결과를 바탕으로 디자이너에게 전달할 피드백을 생성합니다. */
  private _generateFeedbacks(
    cssKey: string,
    analysis: CssKeyAnalysis
  ): DesignFeedback[] {
    const feedbacks: DesignFeedback[] = [];

    if (analysis.missingItemIds.length > 0) {
      feedbacks.push({
        cssKey,
        type: "MISSING_PROP",
        message: `'${cssKey}' 속성이 대다수(${analysis.dominantCount}개)에 존재하지만, 다음 아이템들에서 누락되었습니다: ${analysis.missingItemNames.join(", ")}`,
        itemIds: analysis.missingItemIds,
        itemNames: analysis.missingItemNames,
      });
    }

    const mismatchStatistics = analysis.sortedStatistics.slice(1);
    const mismatchItemIds = mismatchStatistics.flatMap((stat) => stat.ids);
    const mismatchItemNames = mismatchStatistics.flatMap((stat) => stat.names);

    if (mismatchItemIds.length > 0) {
      feedbacks.push({
        cssKey,
        type: "VALUE_MISMATCH",
        message: `'${cssKey}' 속성값이 대다수(${analysis.dominantValue})와 다릅니다. 확인 필요: ${mismatchItemNames.join(", ")}`,
        itemIds: mismatchItemIds,
        itemNames: mismatchItemNames,
      });
    }

    return feedbacks;
  }

  /** base에 포함되지 않은 CSS만 남긴 dynamic 아이템들을 생성합니다. */
  private _createDynamicItems(
    items: VariantItem[],
    baseStyle: CssStyle
  ): VariantItem[] {
    return items.map((item) => ({
      ...item,
      css: Object.fromEntries(
        Object.entries(item.css ?? {}).filter(
          ([cssKey]) => !(cssKey in baseStyle)
        )
      ),
    }));
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /** variant props를 정렬된 "key=value|key=value" 형식의 문자열로 직렬화합니다. */
  private _serializeVariantProps(variantProps: VariantProps): string {
    return Object.entries(variantProps)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join("|");
  }
}

export default UpdateStyle;
