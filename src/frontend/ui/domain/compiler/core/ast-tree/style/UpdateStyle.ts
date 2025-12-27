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
type VariantPropsMap = Record<string, VariantProps>;

/** 아이템의 variant props와 CSS를 포함하는 타입 */
type ItemWithCss = {
  id: string;
  variant: VariantProps;
  css: CssStyle;
  name: string;
};

/** 피드백 리포트 타입 */
type FeedbackReport = {
  key: string;
  type: "MISSING_PROP" | "VALUE_MISMATCH";
  message: string;
  itemIds: string[];
  itemNames: string[];
};

/** CSS 값 통계 정보 */
type CssValueStats = {
  count: number;
  ids: string[];
  names: string[];
  originalValue: string;
};

/** Variant 그룹 (같은 fixed props를 가진 아이템들의 묶음) */
type VariantGroup = {
  varyKey: string;
  fixed: VariantProps;
  items: Array<{ id: string; value: VariantProps }>;
};

/** Variant 스타일 결과 */
type VariantStyleResult = {
  base: CssStyle;
  dynamic: ItemWithCss[];
  report: FeedbackReport[];
};

class UpdateStyle {
  private _specDataManager: SpecDataManager;

  constructor(specDataManager: SpecDataManager) {
    this._specDataManager = specDataManager;
  }

  public updateStyle(pivotTree: TempAstTree) {
    traverseBFS(pivotTree, (pivotNode) => {
      const items = pivotNode.mergedNode.reduce(
        (itemsMap: Record<string, any>, mergedItem) => {
          itemsMap[mergedItem.id] = {
            ...this._parseVariantProps(mergedItem.name),
            css: this._specDataManager.getRenderTreeById(mergedItem.id)
              .cssStyle,
          };

          return itemsMap;
        },
        {}
      );

      // variant props만 추출 (css 제외)
      const variantPropsOnly: VariantPropsMap = Object.fromEntries(
        Object.entries(items).map(([id, item]) => {
          const { css: _css, ...variantProps } = item;
          return [id, variantProps as VariantProps];
        })
      );

      const allGroups = this._groupBySingleVaryKey(variantPropsOnly);

      const variantStyleMap: Record<string, VariantGroup[]> =
        Object.fromEntries(
          Object.keys(pivotTree.props).map((propKey) => [
            propKey,
            allGroups.filter((group) => group.varyKey === propKey),
          ])
        );

      pivotNode.style = this._computeStyle(variantStyleMap, items);
    });

    return pivotTree;
  }

  private _parseVariantProps(variantName: string): VariantProps {
    return Object.fromEntries(
      variantName
        .split(",")
        .map((pair) => pair.trim())
        .map((pair) => pair.split("=").map((s) => s.trim()))
        .filter(([key, value]) => key && value)
    );
  }

  private _computeStyle(
    variantStyleMap: Record<string, VariantGroup[]>,
    items: Record<string, { css: CssStyle } & VariantProps>
  ): StyleObject {
    // variantStyleMap의 모든 그룹을 varyKey별로 재구성
    const variantGroups = this._buildVariantGroups(variantStyleMap, items);

    // variantGroups를 평탄화하여 variantKey별로 아이템 매핑
    const variantItemsMap = this._flattenToVariantItemsMap(variantGroups);

    // 각 variant별 스타일 결과 계산
    const variantStyle: Record<string, VariantStyleResult> = Object.fromEntries(
      Object.entries(variantItemsMap).map(([variantKey, itemsWithCss]) => [
        variantKey,
        this._convertVariantItems(itemsWithCss),
      ])
    );

    const variantResult = this._convertVariantStyle(variantStyle);

    return { base: variantResult.base, dynamic: [] };
  }

  private _buildVariantGroups(
    variantStyleMap: Record<string, VariantGroup[]>,
    items: Record<string, { css: CssStyle } & VariantProps>
  ): Record<string, ItemWithCss[][]> {
    const nonEmptyGroups = Object.values(variantStyleMap)
      .flat()
      .filter((group) => group.items.length > 0);

    return nonEmptyGroups.reduce<Record<string, ItemWithCss[][]>>(
      (acc, group) => {
        const variantItems: ItemWithCss[] = group.items.map((groupItem) => ({
          id: groupItem.id,
          variant: { [group.varyKey]: groupItem.value[group.varyKey] },
          name: this._specDataManager.getSpecById(groupItem.id).name,
          css: items[groupItem.id]?.css ?? {},
        }));

        if (!acc[group.varyKey]) {
          acc[group.varyKey] = [];
        }
        acc[group.varyKey].push(variantItems);

        return acc;
      },
      {}
    );
  }

  private _flattenToVariantItemsMap(
    variantGroups: Record<string, ItemWithCss[][]>
  ): Record<string, ItemWithCss[]> {
    const allItems = Object.values(variantGroups).flat(2);

    return allItems.reduce<Record<string, ItemWithCss[]>>((acc, item) => {
      const variantKey = this._serializeVariantProps(item.variant);
      if (!acc[variantKey]) {
        acc[variantKey] = [];
      }
      acc[variantKey].push(item);
      return acc;
    }, {});
  }

  private _convertVariantStyle(
    variantStyle: Record<string, VariantStyleResult>
  ) {
    // 1. Dynamic variants 구조 생성
    const dynamicVariants = this._buildDynamicVariants(variantStyle);

    // 2. 모든 variant에 공통인 CSS 속성 추출
    const globalBase = this._extractCommonBaseStyles(variantStyle);

    // 3. 각 variant의 base 스타일 최적화
    this._optimizeVariantBaseStyles(dynamicVariants);

    return { base: globalBase, dynamicVariants };
  }

  private _buildDynamicVariants(
    variantStyle: Record<string, VariantStyleResult>
  ): DynamicVariants {
    return Object.entries(variantStyle).reduce<DynamicVariants>(
      (acc, [variantKey, styleResult]) => {
        const propName = variantKey.split("=")[0];

        if (!acc[propName]) {
          acc[propName] = { style: { base: {}, dynamic: [] } };
        }

        acc[propName].style.dynamic.push({
          variantName: variantKey,
          base: styleResult.base,
          dynamic: [] as [],
          report: [] as [],
        });

        return acc;
      },
      {}
    );
  }

  private _extractCommonBaseStyles(
    variantStyle: Record<string, VariantStyleResult>
  ): CssStyle {
    const allStyleResults = Object.values(variantStyle);
    if (allStyleResults.length === 0) return {};

    const firstBase = allStyleResults[0].base;

    return Object.fromEntries(
      Object.entries(firstBase).filter(([cssProperty, cssValue]) =>
        allStyleResults.every(
          (styleResult) => styleResult.base[cssProperty] === cssValue
        )
      )
    );
  }

  private _optimizeVariantBaseStyles(dynamicVariants: DynamicVariants): void {
    Object.values(dynamicVariants).forEach((variantEntry) => {
      const dynamicStyle = variantEntry.style.dynamic;

      if (dynamicStyle.length === 0) return;
      if (dynamicStyle.length === 1) {
        variantEntry.style.base = dynamicStyle[0].base;
        return;
      }

      const pivotBase = dynamicStyle[0].base;

      // 각 CSS 키가 몇 번 다른지 계산
      const diffCountMap = dynamicStyle.reduce<Record<string, number>>(
        (acc, dynamicItem) => {
          const diffResult = diff(pivotBase, dynamicItem.base);
          Object.keys(diffResult).forEach((cssKey) => {
            acc[cssKey] = (acc[cssKey] ?? 0) + 1;
          });
          return acc;
        },
        {}
      );

      // 모든 variant에서 다른 CSS 키만 필터링
      const varyingCssKeys = Object.entries(diffCountMap)
        .filter(([_cssKey, count]) => count === dynamicStyle.length - 1)
        .map(([cssKey]) => cssKey);

      // 각 dynamic 아이템의 base를 varying 키만 포함하도록 업데이트
      dynamicStyle.forEach((item, index) => {
        dynamicStyle[index].base = Object.fromEntries(
          varyingCssKeys.map((cssKey) => [cssKey, item.base[cssKey]])
        );
      });
    });
  }

  private _groupBySingleVaryKey(data: VariantPropsMap): VariantGroup[] {
    const ids = Object.keys(data);
    if (ids.length === 0) return [];

    // 모든 키를 모아 정렬(시그니처 안정화)
    // css 키는 variant prop이 아니므로 제외
    const allPropKeys = Array.from(
      new Set(ids.flatMap((itemId) => Object.keys(data[itemId] ?? {})))
    )
      .filter((propKey) => propKey !== "css") // css는 variant prop이 아니므로 제외
      .sort();

    const groupsMap = new Map<string, VariantGroup>();

    for (const varyKey of allPropKeys) {
      for (const itemId of ids) {
        const variantProps = data[itemId];
        if (!variantProps) continue;

        // varyKey를 제외한 나머지 키-값으로 fixed + signature 생성
        // css는 이미 allPropKeys에서 제외되었음
        const fixedEntries = allPropKeys
          .filter((propKey) => propKey !== varyKey)
          .map((propKey) => {
            const propValue = variantProps[propKey];
            // 값이 string이 아닌 경우(예: 객체)는 제외
            return typeof propValue === "string"
              ? ([propKey, propValue] as const)
              : null;
          })
          .filter((entry): entry is [string, string] => entry !== null);

        const fixed = Object.fromEntries(fixedEntries) as VariantProps;
        const signature = fixedEntries
          .map(([propKey, propValue]) => `${propKey}=${propValue}`)
          .join("|");

        const groupKey = `${varyKey}::${signature}`;
        const group = groupsMap.get(groupKey) ?? { varyKey, fixed, items: [] };
        group.items.push({ id: itemId, value: variantProps });
        groupsMap.set(groupKey, group);
      }
    }

    // 최소 2개 이상 모인 것만 "그룹"으로 인정
    return [...groupsMap.values()].filter((group) => group.items.length >= 2);
  }

  private _serializeVariantProps = (variantProps: VariantProps): string => {
    // 키를 정렬하여 일관된 문자열 생성
    const sortedEntries = Object.entries(variantProps).sort(([keyA], [keyB]) =>
      keyA.localeCompare(keyB)
    );
    return sortedEntries
      .map(([propKey, propValue]) => `${propKey}=${propValue}`)
      .join("|");
  };

  private _convertVariantItems(items: ItemWithCss[]): VariantStyleResult {
    if (!items || items.length === 0) {
      return { base: {}, dynamic: [], report: [] };
    }

    const totalCount = items.length;
    const consensusThreshold = this._calculateConsensusThreshold(totalCount);
    const allCssKeys = this._collectAllCssKeys(items);

    const { base, report } = this._analyzeAndExtractBaseStyles(
      items,
      allCssKeys,
      totalCount,
      consensusThreshold
    );

    const dynamicItems = this._createDynamicItems(items, base);

    return { base, dynamic: dynamicItems, report };
  }

  private _calculateConsensusThreshold(totalCount: number): number {
    if (totalCount <= 2) return totalCount;
    if (totalCount === 3) return 2;
    return Math.ceil(totalCount * 0.7);
  }

  private _collectAllCssKeys(items: ItemWithCss[]): Set<string> {
    return new Set(
      items.flatMap((item) => (item.css ? Object.keys(item.css) : []))
    );
  }

  private _analyzeAndExtractBaseStyles(
    items: ItemWithCss[],
    allCssKeys: Set<string>,
    totalCount: number,
    consensusThreshold: number
  ): { base: CssStyle; report: FeedbackReport[] } {
    const base: CssStyle = {};
    const report: FeedbackReport[] = [];

    allCssKeys.forEach((cssKey) => {
      const analysis = this._analyzeCssKeyStats(items, cssKey);

      if (analysis.sortedStats.length === 0) return;

      const { dominantCount, dominantValue } = analysis;

      // 100% 일치 -> Base 승격
      if (dominantCount === totalCount) {
        base[cssKey] = dominantValue;
        return;
      }

      // 임계값 이상 합의됨 -> 피드백 생성
      if (dominantCount >= consensusThreshold) {
        const feedbacks = this._generateFeedbackReports(
          cssKey,
          dominantCount,
          dominantValue,
          analysis
        );
        report.push(...feedbacks);
      }
    });

    return { base, report };
  }

  private _analyzeCssKeyStats(items: ItemWithCss[], cssKey: string) {
    const valueStats: Record<string, CssValueStats> = {};
    const missingItemIds: string[] = [];
    const missingItemNames: string[] = [];

    items.forEach((item) => {
      const cssValue = item.css?.[cssKey];

      if (cssValue === undefined || cssValue === null) {
        missingItemIds.push(item.id);
        missingItemNames.push(item.name);
      } else {
        const valueKey = String(cssValue);
        if (!valueStats[valueKey]) {
          valueStats[valueKey] = {
            count: 0,
            ids: [],
            names: [],
            originalValue: cssValue,
          };
        }
        valueStats[valueKey].count++;
        valueStats[valueKey].ids.push(item.id);
        valueStats[valueKey].names.push(item.name);
      }
    });

    const sortedStats = Object.values(valueStats).sort(
      (statA, statB) => statB.count - statA.count
    );

    const dominantStat = sortedStats[0];

    return {
      valueStats,
      missingItemIds,
      missingItemNames,
      sortedStats,
      dominantStat,
      dominantCount: dominantStat?.count ?? 0,
      dominantValue: dominantStat?.originalValue ?? "",
    };
  }

  private _generateFeedbackReports(
    cssKey: string,
    dominantCount: number,
    dominantValue: string,
    analysis: ReturnType<typeof this._analyzeCssKeyStats>
  ): FeedbackReport[] {
    const feedbacks: FeedbackReport[] = [];

    // 속성 누락 경고
    if (analysis.missingItemIds.length > 0) {
      feedbacks.push({
        key: cssKey,
        type: "MISSING_PROP",
        message: `'${cssKey}' 속성이 대다수(${dominantCount}개)에 존재하지만, 다음 아이템들에서 누락되었습니다: ${analysis.missingItemNames.join(", ")}`,
        itemIds: analysis.missingItemIds,
        itemNames: analysis.missingItemNames,
      });
    }

    // 값 불일치 경고
    const mismatchStats = analysis.sortedStats.slice(1);
    const mismatchItemIds = mismatchStats.flatMap((stat) => stat.ids);
    const mismatchItemNames = mismatchStats.flatMap((stat) => stat.names);

    if (mismatchItemIds.length > 0) {
      feedbacks.push({
        key: cssKey,
        type: "VALUE_MISMATCH",
        message: `'${cssKey}' 속성값이 대다수(${String(dominantValue)})와 다릅니다. 확인 필요: ${mismatchItemNames.join(", ")}`,
        itemIds: mismatchItemIds,
        itemNames: mismatchItemNames,
      });
    }

    return feedbacks;
  }

  private _createDynamicItems(
    items: ItemWithCss[],
    base: CssStyle
  ): ItemWithCss[] {
    return items.map((item) => ({
      ...item,
      css: Object.fromEntries(
        Object.entries(item.css || {}).filter(([cssKey]) => !(cssKey in base))
      ),
    }));
  }
}

export default UpdateStyle;
