import {
  DynamicVariants,
  StyleObject,
  SuperTreeNode,
  TempAstTree,
} from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { PropsDef } from "@compiler/core/RefineProps";
import { traverseBFS } from "@compiler/utils/traverse";
import { diff } from "deep-object-diff";

type Variant = Record<string, string>;
type Data = Record<string, Variant>;

type FeedbackReport = {
  key: string;
  type: "MISSING_PROP" | "VALUE_MISMATCH";
  message: string;
  itemIds: string[];
  itemNames: string[]; // 추가된 필드: 사람이 읽기 쉬운 이름 목록
};

type Group = {
  varyKey: string; // 이 키만 달라질 수 있음
  fixed: Record<string, string>; // 나머지 키들은 고정(같음)
  items: Array<{ id: string; value: Variant }>;
};

class UpdateStyle {
  private _specDataManager: SpecDataManager;

  constructor(specDataManager: SpecDataManager) {
    this._specDataManager = specDataManager;
  }

  public updateStyle(pivotTree: TempAstTree) {
    traverseBFS(pivotTree, (pivotNode) => {
      const items = pivotNode.mergedNode.reduce(
        (acc: Record<string, any>, value) => {
          acc[value.id] = {
            ...this._parseVariantProps(value.name),
            css: this._specDataManager.getRenderTreeById(value.id).cssStyle,
          };

          return acc;
        },
        {}
      );

      // variant props만 추출 (css 제외)
      const variantPropsOnly: Record<string, Variant> = {};
      Object.entries(items).forEach(([id, item]) => {
        const { css: _css, ...variantProps } = item;
        variantPropsOnly[id] = variantProps as Variant;
      });

      const variantStyleMap: Record<string, Group[]> = {};

      Object.entries(pivotTree.props).forEach(([key, value]) => {
        const groups = this._groupBySingleVaryKey(variantPropsOnly).filter(
          (value) => value.varyKey === key
        );

        variantStyleMap[key] = groups;
      });

      pivotNode.style = this._computeStyle(variantStyleMap, items);
    });

    return pivotTree;
  }

  private _parseVariantProps(variantName: string): Record<string, string> {
    const props: Record<string, string> = {};
    const pairs = variantName.split(",").map((s) => s.trim());

    for (const pair of pairs) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (key && value) {
        props[key] = value;
      }
    }

    return props;
  }

  private _computeStyle(
    variantStyleMap: Record<string, Group[]>,
    items: Record<string, any>
  ): StyleObject {
    const variantGroups: Record<
      string,
      Array<
        Array<{
          id: string;
          variant: Record<string, string>;
          css: any;
          name: string;
        }>
      >
    > = {};

    Object.entries(variantStyleMap).forEach(([_key, groups]) => {
      if (groups.length === 0) return;

      groups.forEach((group) => {
        if (!variantGroups[group.varyKey]) {
          variantGroups[group.varyKey] = [];
        }

        const variantItems = group.items.map((item) => {
          const { value } = item;
          // items에서 css 가져오기 (variant props에는 css가 없으므로)
          const itemWithCss = items[item.id];

          return {
            id: item.id,
            variant: { [group.varyKey]: value[group.varyKey] },
            name: this._specDataManager.getSpecById(item.id).name,
            css: itemWithCss?.css,
          };
        });

        variantGroups[group.varyKey].push(variantItems);
      });
    });

    /**
     * TODO
     * variantGroups에서 나온 각 variant 별로 어떤 값만 다른지 정확히 추출해야한다.
     * 추출할 수 없는 경우도 판단해야 한다. (디자이너에게 피드백)
     * variantGroups으로 판단.
     */

    const L: Record<
      string,
      {
        id: string;
        variant: Record<string, string>;
        css: any;
        name: string;
      }[]
    > = {};

    Object.entries(variantGroups).forEach(([key, groups]) => {
      groups.forEach((group) => {
        group.forEach((item) => {
          if (!L[this._toStringName(item.variant)]) {
            L[this._toStringName(item.variant)] = [];
          }
          L[this._toStringName(item.variant)].push(item);
        });
      });
    });

    const variantStyle: Record<string, any> = {};

    const allReport: FeedbackReport[] = [];

    Object.entries(L).forEach(([key, value]) => {
      const { base, dynamic, report } = this._convertVariantItems(value);
      allReport.push(...report);
      variantStyle[key] = { base, dynamic, report };
    });

    const variantResult = this._convertVariantStyle(variantStyle);

    console.log(variantResult);

    return { base: variantResult.base, dynamic: [] };
  }

  private _convertVariantStyle(variantStyle: Record<string, any>) {
    const variantMap: {
      base: Record<string, string>;
      dynamicVariants: DynamicVariants;
    } = {
      base: {},
      dynamicVariants: {},
    };

    Object.entries(variantStyle).forEach(([key, value]) => {
      //기초적인 형태 만들기
      const _key = key.split("=")[0];
      if (!variantMap.dynamicVariants[_key]) {
        variantMap.dynamicVariants[_key] = {
          style: { base: {}, dynamic: [] },
        };
      }
      variantMap.dynamicVariants[_key].style.dynamic.push({
        variantName: key,
        ...value,
      });

      //baseCss 만들기
      const baseStyle = variantMap.base;
      const baseCss = value.base;

      Object.entries(baseCss).forEach(([k, v]) => {
        let flag = true;

        for (const variantStyleKey in variantStyle) {
          const target = variantStyle[variantStyleKey];
          if (target.base[k] !== v) {
            flag = false;
            break;
          }
        }

        if (flag) {
          baseStyle[k] = v as string;
        }
      });
    });

    //variant 마다 base 세팅하기
    Object.entries(variantMap.dynamicVariants).forEach(([key, value]) => {
      const dynamicStyle = value.style.dynamic;

      if (dynamicStyle.length === 0) return;
      if (dynamicStyle.length === 1) {
        value.style.base = dynamicStyle[0].base;
        return;
      }

      const pivotBase = dynamicStyle[0].base;

      const memory: any = {};

      for (const dynamicItem in dynamicStyle) {
        const targetBase = dynamicStyle[dynamicItem].base;

        const diffResult = diff(pivotBase, targetBase);

        Object.entries(diffResult).forEach(([k, v]) => {
          if (!memory[k]) {
            memory[k] = 0;
          }

          memory[k]++;
        });
      }

      const filteredMemory = Object.entries(memory)
        .filter(([k, v]) => {
          return v === dynamicStyle.length - 1;
        })
        .map(([k, v]) => k);

      for (const dynamicItem in dynamicStyle) {
        const newBase = filteredMemory.reduce((acc, style) => {
          acc[style] = dynamicStyle[dynamicItem].base[style];

          return acc;
        }, {});
        dynamicStyle[dynamicItem].base = newBase;
      }
    });

    return variantMap;
  }

  private _groupBySingleVaryKey(data: Data): Group[] {
    const ids = Object.keys(data);
    if (ids.length === 0) return [];

    // 모든 키를 모아 정렬(시그니처 안정화)
    // css 키는 variant prop이 아니므로 제외
    const allKeys = Array.from(
      new Set(ids.flatMap((id) => Object.keys(data[id] ?? {})))
    )
      .filter((k) => k !== "css") // css는 variant prop이 아니므로 제외
      .sort();

    const groupsMap = new Map<string, Group>();

    for (const varyKey of allKeys) {
      for (const id of ids) {
        const v = data[id];
        if (!v) continue;

        // varyKey를 제외한 나머지 키-값으로 fixed + signature 생성
        // css는 이미 allKeys에서 제외되었음
        const fixedEntries = allKeys
          .filter((k) => k !== varyKey)
          .map((k) => {
            const val = v[k];
            // 값이 string이 아닌 경우(예: 객체)는 제외
            return typeof val === "string" ? ([k, val] as const) : null;
          })
          .filter((entry): entry is [string, string] => entry !== null);

        const fixed = Object.fromEntries(fixedEntries) as Record<
          string,
          string
        >;
        const sig = fixedEntries.map(([k, val]) => `${k}=${val}`).join("|");

        const mapKey = `${varyKey}::${sig}`;
        const g = groupsMap.get(mapKey) ?? { varyKey, fixed, items: [] };
        g.items.push({ id, value: v });
        groupsMap.set(mapKey, g);
      }
    }

    // 최소 2개 이상 모인 것만 "그룹"으로 인정
    return [...groupsMap.values()].filter((g) => g.items.length >= 2);
  }

  private _toStringName = (object: Record<string, string>) => {
    // 키를 정렬하여 일관된 문자열 생성
    const sortedEntries = Object.entries(object).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return sortedEntries.map(([key, value]) => `${key}=${value}`).join("|");
  };

  private _convertVariantItems(
    items: {
      id: string;
      variant: Record<string, string>;
      css: any;
      name: string; // name 속성이 필수라고 가정
    }[]
  ) {
    // 1. 방어 코드
    if (!items || items.length === 0) {
      return { base: {}, dynamic: [], report: [] };
    }

    const base: Record<string, any> = {};
    const report: FeedbackReport[] = [];
    const totalCount = items.length;

    // 2. 합의 임계값 설정
    let consensusThreshold: number;
    if (totalCount <= 2) {
      consensusThreshold = totalCount;
    } else if (totalCount === 3) {
      consensusThreshold = 2;
    } else {
      consensusThreshold = Math.ceil(totalCount * 0.7);
    }

    // 3. 모든 아이템의 CSS 키 수집
    const allCssKeys = new Set<string>();
    items.forEach((item) => {
      if (item.css) {
        Object.keys(item.css).forEach((k) => allCssKeys.add(k));
      }
    });

    // 4. 각 키별 통계 분석
    allCssKeys.forEach((key) => {
      // 통계 저장 구조에 names 배열 추가
      const valueStats: Record<
        string,
        {
          count: number;
          ids: string[];
          names: string[]; // 이름 저장용
          originalValue: any;
        }
      > = {};

      const missingIds: string[] = [];
      const missingNames: string[] = []; // 누락된 아이템 이름 저장용

      items.forEach((item) => {
        const val = item.css?.[key];

        if (val === undefined || val === null) {
          missingIds.push(item.id);
          missingNames.push(item.name); // 이름 수집
        } else {
          const strVal = String(val);
          if (!valueStats[strVal]) {
            valueStats[strVal] = {
              count: 0,
              ids: [],
              names: [],
              originalValue: val,
            };
          }
          valueStats[strVal].count++;
          valueStats[strVal].ids.push(item.id);
          valueStats[strVal].names.push(item.name); // 이름 수집
        }
      });

      const sortedStats = Object.values(valueStats).sort(
        (a, b) => b.count - a.count
      );
      if (sortedStats.length === 0) return;

      const dominantStat = sortedStats[0];
      const dominantCount = dominantStat.count;
      const dominantValue = dominantStat.originalValue;

      // A. 100% 일치 -> Base 승격
      if (dominantCount === totalCount) {
        base[key] = dominantValue;
        return;
      }

      // B. 임계값 이상 합의됨 -> 피드백 생성
      if (dominantCount >= consensusThreshold) {
        // B-1. 속성 누락 경고
        if (missingIds.length > 0) {
          report.push({
            key,
            type: "MISSING_PROP",
            message: `'${key}' 속성이 대다수(${dominantCount}개)에 존재하지만, 다음 아이템들에서 누락되었습니다: ${missingNames.join(", ")}`,
            itemIds: missingIds,
            itemNames: missingNames, // 결과 포함
          });
        }

        // B-2. 값 불일치 경고
        const mismatchIds: string[] = [];
        const mismatchNames: string[] = []; // 불일치 이름 수집

        sortedStats.slice(1).forEach((stat) => {
          mismatchIds.push(...stat.ids);
          mismatchNames.push(...stat.names);
        });

        if (mismatchIds.length > 0) {
          report.push({
            key,
            type: "VALUE_MISMATCH",
            message: `'${key}' 속성값이 대다수(${String(dominantValue)})와 다릅니다. 확인 필요: ${mismatchNames.join(", ")}`,
            itemIds: mismatchIds,
            itemNames: mismatchNames, // 결과 포함
          });
        }
      }
    });

    // 5. Dynamic 객체 생성
    const dynamic = items.map((item) => {
      const remainingCss: Record<string, any> = {};
      const itemCss = item.css || {};

      Object.entries(itemCss).forEach(([key, value]) => {
        if (!base.hasOwnProperty(key)) {
          remainingCss[key] = value;
        }
      });

      return { ...item, css: remainingCss };
    });

    return { base, dynamic, report };
  }
}

export default UpdateStyle;
