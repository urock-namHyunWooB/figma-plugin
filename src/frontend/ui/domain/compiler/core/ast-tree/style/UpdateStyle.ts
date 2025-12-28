import { DynamicVariants, StyleObject, TempAstTree } from "@compiler";
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

  constructor(specDataManager: SpecDataManager) {
    this._specDataManager = specDataManager;
  }

  // ============================================================
  // Public Methods
  // ============================================================

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

    return pivotTree;
  }

  // ============================================================
  // Style Building Methods
  // ============================================================

  private _buildItemsWithStyle(
    mergedNodes: Array<{ id: string; name: string }>
  ): Record<string, { css: CssStyle } & VariantProps> {
    return Object.fromEntries(
      mergedNodes.map((node) => {
        const variantProps = this._parseVariantName(node.name);
        const css = this._specDataManager.getRenderTreeById(node.id).cssStyle;
        return [node.id, { ...variantProps, css }] as const;
      })
    ) as Record<string, { css: CssStyle } & VariantProps>;
  }

  private _parseVariantName(variantName: string): VariantProps {
    const keyValuePairs = variantName
      .split(",")
      .map((pair) => pair.trim())
      .map((pair) => pair.split("=").map((s) => s.trim()))
      .filter(([key, value]) => key && value);

    return Object.fromEntries(keyValuePairs);
  }

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

  private _computeOptimizedStyle(
    groupsByPropKey: Record<string, VariantGroup[]>,
    itemsWithStyle: Record<string, { css: CssStyle } & VariantProps>
  ): StyleObject {
    const itemsByVaryKey = this._transformGroupsToVariantItems(
      groupsByPropKey,
      itemsWithStyle
    );

    const itemsByVariantKey = this._flattenAndGroupByVariantKey(itemsByVaryKey);

    const styleResultByVariant = this._computeStyleResults(itemsByVariantKey);

    const optimizedResult = this._optimizeStyles(styleResultByVariant);

    return { base: optimizedResult.commonBaseStyle, dynamic: [] };
  }

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

  private _flattenAndGroupByVariantKey(
    itemsByVaryKey: Record<string, VariantItem[][]>
  ): Record<string, VariantItem[]> {
    const allVariantItems = Object.values(itemsByVaryKey).flat(2);

    return groupByKey(allVariantItems, (item) =>
      this._serializeVariantProps(item.variant)
    );
  }

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
        dynamic: [] as [],
        report: [] as [],
      })
    );

    return Object.fromEntries(
      Object.entries(groupedByPropName).map(([propName, dynamicStyles]) => [
        propName,
        { style: { base: {}, dynamic: dynamicStyles } },
      ])
    );
  }

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

  private _extractVaryingStylesOnly(
    dynamicVariants: DynamicVariants
  ): DynamicVariants {
    return Object.fromEntries(
      Object.entries(dynamicVariants).map(([propName, variantEntry]) => [
        propName,
        {
          style: {
            base: this._computeVariantBaseStyle(variantEntry.style.dynamic),
            dynamic: this._filterToVaryingStyles(variantEntry.style.dynamic),
          },
        },
      ])
    );
  }

  private _computeVariantBaseStyle(
    dynamicStyles: Array<{ base: CssStyle }>
  ): CssStyle {
    if (dynamicStyles.length <= 1) {
      return dynamicStyles[0]?.base ?? {};
    }
    return {};
  }

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

  private _collectAllPropKeys(
    variantPropsById: VariantPropsById,
    itemIds: string[]
  ): string[] {
    const allKeys = itemIds.flatMap((id) =>
      Object.keys(variantPropsById[id] ?? {})
    );

    return [...new Set(allKeys)].filter((key) => key !== "css").sort();
  }

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

  private _calculateConsensusThreshold(totalCount: number): number {
    if (totalCount <= 2) return totalCount;
    if (totalCount === 3) return 2;
    return Math.ceil(totalCount * 0.7);
  }

  private _collectAllCssKeys(items: VariantItem[]): string[] {
    return [...new Set(items.flatMap((item) => Object.keys(item.css ?? {})))];
  }

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

  private _serializeVariantProps(variantProps: VariantProps): string {
    return Object.entries(variantProps)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join("|");
  }
}

export default UpdateStyle;
