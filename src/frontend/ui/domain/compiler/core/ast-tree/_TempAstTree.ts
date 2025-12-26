import {
  ConditionNode,
  StyleObject,
  StyleTree,
  SuperTreeNode,
  TempAstTree,
  VisibleValue,
} from "@compiler";
import { PropsDef } from "@compiler/core/RefineProps";

import SpecDataManager from "../../manager/SpecDataManager";
import { findNodeBFS, traverseBFS } from "@compiler/utils/traverse";
import helper from "@compiler/manager/HelperManager";
import { BinaryOperator } from "@compiler/types/customType";
import debug from "@compiler/manager/DebuggingManager";
import { dy } from "happy-dom/lib/PropertySymbol";
import { logDOM } from "@testing-library/dom";

import hash from "stable-hash";
import { isForInitializer } from "typescript";

type Variant = Record<string, string>;
type Data = Record<string, Variant>;

type Group = {
  varyKey: string; // 이 키만 달라질 수 있음
  fixed: Record<string, string>; // 나머지 키들은 고정(같음)
  items: Array<{ id: string; value: Variant }>;
};
/**
 * FinalAST 만들기 중간 단계로써 대략적인 값 세팅을 목적으로 한다.
 */
class _TempAstTree {
  private _tempAstTree: TempAstTree;

  private _specDataManager: SpecDataManager;
  private _refinedProps: PropsDef;
  private _superTree: SuperTreeNode;

  public get tempAstTree() {
    return this._tempAstTree;
  }
  constructor(
    specDataManager: SpecDataManager,
    superTree: SuperTreeNode,
    refinedProps: PropsDef
  ) {
    this._specDataManager = specDataManager;
    this._refinedProps = refinedProps;
    this._superTree = superTree;

    const variantTrees = specDataManager.getRenderTree().children;

    let tempAstTree = this.createTempAstTree(superTree, refinedProps);

    tempAstTree = this.updateMergedNode(tempAstTree);
    tempAstTree = this.updateStyle2(tempAstTree, variantTrees);
    tempAstTree = this.updateNormalizeStyle(tempAstTree);
    tempAstTree = this.updateVisible(tempAstTree);
    tempAstTree = this.updateConditionalWrapper(tempAstTree);
    tempAstTree = this.updateProps(tempAstTree);

    this._tempAstTree = tempAstTree;
  }

  private updateMergedNode(tempAstTree: TempAstTree) {
    traverseBFS(tempAstTree, (node, meta) => {
      const newMergedNode = node.mergedNode.map((node) => {
        const renderNode = this._specDataManager.getRenderTreeById(node.id);
        return { ...node, ...renderNode };
      });

      node.mergedNode = newMergedNode;
    });

    return tempAstTree;
  }
  private updateProps(tempAstTree: TempAstTree) {
    traverseBFS(tempAstTree, (node) => {
      const componentPropertyReferences = this._specDataManager.getSpecById(
        node.id
      ).componentPropertyReferences;

      if (componentPropertyReferences) {
        node.props = { ...node.props, ...componentPropertyReferences };
      }
    });

    return tempAstTree;
  }

  private createTempAstTree(
    superTree: SuperTreeNode,
    refinedProps: PropsDef
  ): TempAstTree {
    /**
     * 최상위 부모만 refinedProps 할당됨.
     */
    const convert = (node: SuperTreeNode, isRoot: boolean): TempAstTree => {
      const styleTree = this._specDataManager.getRenderTreeById(node.id);

      const children = node.children
        .filter((child): child is SuperTreeNode => !!child)
        .map((child) => convert(child, false));

      return {
        ...node,
        props: isRoot ? (refinedProps as any) : {},
        style: {
          base: styleTree?.cssStyle || {},
          dynamic: [],
        },
        visible: null,
        children,
      } as TempAstTree;
    };

    return convert(superTree, true);
  }

  private updateStyle2(pivotTree: TempAstTree, targetTrees: StyleTree[]) {
    traverseBFS(pivotTree, (pivotNode) => {
      /**
       * mergedNode에서 variant마다 하나만 다르고 다른건 다 똑같은걸 찾는다.
       * 비교해서 다른 style을 찾는다.
       * varaint별로 다른 style을 맵핑
       */

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

      const variantStyleMap: Record<string, Group[]> = {};

      Object.entries(pivotTree.props).forEach(([key, value]) => {
        const groups = this._groupBySingleVaryKey(items).filter(
          (value) => value.varyKey === key
        );

        variantStyleMap[key] = groups;
      });

      pivotNode.style = this._computeStyle(variantStyleMap);
    });

    return pivotTree;
  }

  private _computeStyle(variantStyleMap: Record<string, Group[]>): StyleObject {
    const variantGroups: Record<
      string,
      Array<Array<{ id: string; variant: Record<string, string>; css: any }>>
    > = {};

    Object.entries(variantStyleMap).forEach(([_key, groups]) => {
      if (groups.length === 0) return;

      groups.forEach((group) => {
        if (!variantGroups[group.varyKey]) {
          variantGroups[group.varyKey] = [];
        }

        const variantItems = group.items.map((item) => {
          const { value } = item;

          return {
            id: item.id,
            variant: { [group.varyKey]: value[group.varyKey] },
            name: this._specDataManager.getSpecById(item.id).name,
            css: value.css,
          };
        });

        variantGroups[group.varyKey].push(variantItems);
      });
    });

    /**
     * TODO
     * variantGroups에서 나온 각 variant 별로 어떤 값만 다른지 정확히 추출해야한다.
     * 추출할 수 없는 경우도 판단해야 한다. (디자이너에게 피드백)
     */

    Object.entries(variantGroups).forEach(([key, value]) => {
      const mergedStyles = value.map((group) => {
        return this._mergeStyle(group);
      });

      console.log(mergedStyles);

      // const result = this._validateVariants(aa);
      // console.log(result);
    });

    return { base: {}, dynamic: [] };
  }

  private _validateVariants(
    bb: {
      mergedNodes: any[];
      mergedIds: string[];
      mergedNames: string[];
      base: Record<string, any>;
      dynamic: {
        variant: Record<string, string>;
        style: Record<string, any>;
      }[];
    }[]
  ) {
    // dynamic 배열을 비교 가능한 문자열로 변환하는 함수
    const dynamicToKey = (
      dynamic: {
        variant: Record<string, string>;
        style: Record<string, any>;
      }[]
    ): string => {
      // variant를 정렬하여 일관된 문자열 생성
      const sortedDynamic = dynamic
        .map((item) => {
          // variant 정렬
          const sortedVariantEntries = Object.entries(item.variant).sort(
            ([a], [b]) => a.localeCompare(b)
          );
          const variantKey = sortedVariantEntries
            .map(([key, value]) => `${key}=${value}`)
            .join("|");

          // style 정렬 (깊은 복사 후 정렬)
          const sortedStyleEntries = Object.entries(item.style).sort(
            ([a], [b]) => a.localeCompare(b)
          );
          const styleKey = JSON.stringify(
            Object.fromEntries(sortedStyleEntries)
          );

          return `${variantKey}:${styleKey}`;
        })
        .sort()
        .join("||");
      return sortedDynamic;
    };

    // dynamic이 같은 요소들을 그룹화
    const grouped = new Map<string, typeof bb>();
    bb.forEach((item) => {
      const key = dynamicToKey(item.dynamic);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    });

    // 그룹화된 요소들을 합쳐서 반환
    const result = Array.from(grouped.values()).map((group) => {
      if (group.length === 1) {
        return group[0];
      }

      // 여러 요소를 합치기
      const merged = {
        mergedNodes: [] as any[],
        mergedIds: [] as string[],
        mergedNames: [] as string[],
        base: group[0].base, // base는 첫 번째 것을 사용 (모두 같을 것으로 예상)
        dynamic: group[0].dynamic, // dynamic은 모두 같으므로 첫 번째 것을 사용
      };

      // mergedIds와 mergedNames 합치기
      group.forEach((item) => {
        merged.mergedNodes.push(...item.mergedNodes);
        merged.mergedIds.push(...item.mergedIds);
        merged.mergedNames.push(...item.mergedNames);
      });

      return merged;
    });

    return result;
  }

  private _mergeStyle(
    group: Array<{ id: string; variant: Record<string, string>; css: any }>
  ): {
    mergedNodes: any[];
    mergedIds: string[];
    mergedNames: string[];
    base: Record<string, any>;
    dynamic: { variant: Record<string, string>; style: Record<string, any> }[];
  } {
    if (group.length === 0)
      return {
        mergedIds: [],
        base: {},
        dynamic: [],
        mergedNames: [],
        mergedNodes: [],
      };

    const toStringName = (object: Record<string, string>) => {
      // 키를 정렬하여 일관된 문자열 생성
      const sortedEntries = Object.entries(object).sort(([a], [b]) =>
        a.localeCompare(b)
      );
      return sortedEntries.map(([key, value]) => `${key}=${value}`).join("|");
    };

    const mergedIds = group.map((item) => item.id);
    const mergedNames = group.map((item) => toStringName(item.variant));
    const mergedNodes = group.map((item) =>
      this._specDataManager.getRenderTreeById(item.id)
    );
    const base: Record<string, any> = {};

    const dynamic = new Map<
      string,
      { variant: Record<string, string>; style: Record<string, any> }
    >();

    group.forEach((item) => {
      const key = toStringName(item.variant);
      dynamic.set(key, { variant: item.variant, style: {} });
    });

    Object.entries(group[0].css).forEach(([key, value]) => {
      let isBase = true;

      for (const item of group) {
        if (item.css[key] !== value) {
          isBase = false;
          break;
        }
      }

      if (isBase) {
        base[key] = value;
      } else {
        for (const item of group) {
          const variantKey = toStringName(item.variant);
          const dynamicEntry = dynamic.get(variantKey);
          if (item.css[key] && dynamicEntry) {
            dynamicEntry.style[key] = item.css[key];
          }
        }
      }
    });

    return {
      mergedNodes,
      mergedIds,
      base,
      dynamic: Array.from(dynamic.values()),
      mergedNames,
    };
  }

  /**
   * 두 cssStyle 객체를 비교하여 차이점을 반환합니다.
   * @param style1 첫 번째 cssStyle 객체
   * @param style2 두 번째 cssStyle 객체
   * @returns diff 결과 객체
   */
  private _diffCssStyle(
    style1: Record<string, string>,
    style2: Record<string, string>
  ): {
    added: Record<string, string>; // style2에만 있는 키
    removed: Record<string, string>; // style1에만 있는 키
    changed: Record<string, { from: string; to: string }>; // 값이 변경된 키
    common: Record<string, string>; // 양쪽에 있고 값이 같은 키
  } {
    const added: Record<string, string> = {};
    const removed: Record<string, string> = {};
    const changed: Record<string, { from: string; to: string }> = {};
    const common: Record<string, string> = {};

    const allKeys = new Set([...Object.keys(style1), ...Object.keys(style2)]);

    for (const key of allKeys) {
      const value1 = style1[key];
      const value2 = style2[key];

      if (value1 === undefined && value2 !== undefined) {
        // style2에만 있는 키
        added[key] = value2;
      } else if (value1 !== undefined && value2 === undefined) {
        // style1에만 있는 키
        removed[key] = value1;
      } else if (value1 !== value2) {
        // 값이 다른 키
        changed[key] = { from: value1, to: value2 };
      } else {
        // 값이 같은 키
        common[key] = value1;
      }
    }

    return { added, removed, changed, common };
  }

  private _groupBySingleVaryKey(data: Data): Group[] {
    const ids = Object.keys(data);
    if (ids.length === 0) return [];

    // 모든 키를 모아 정렬(시그니처 안정화)
    const allKeys = Array.from(
      new Set(ids.flatMap((id) => Object.keys(data[id] ?? {})))
    ).sort();

    const groupsMap = new Map<string, Group>();

    for (const varyKey of allKeys) {
      for (const id of ids) {
        const v = data[id];
        if (!v) continue;

        // varyKey를 제외한 나머지 키-값으로 fixed + signature 생성
        const fixedEntries = allKeys
          .filter((k) => k !== varyKey)
          .map((k) => [k, v[k] ?? "__MISSING__"] as const);

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

    // 최소 2개 이상 모인 것만 “그룹”으로 인정
    return [...groupsMap.values()].filter((g) => g.items.length >= 2);
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

  private _rec(
    acc: any,
    answerCount: number,
    count: number,
    allNodes: any,
    cache: any = {}
  ) {
    if (count > answerCount) return;

    //캐시에 없는거 순회
    for (const node of allNodes) {
      if (cache[node.id]) continue;
      cache[node.id] = true;
    }
  }

  /**
   * 여러 variant의 스타일을 분석하여 base를 얻는다.
   */
  private _computeBaseStyleFromVariants(
    variantStyles: Array<{ variantName: string; style: Record<string, any> }>
  ): StyleObject {
    const base: Record<string, any> = {};
    const dynamicMap = new Map<
      string,
      { condition: ConditionNode; style: Record<string, any> }
    >();

    // 1) 네 데이터(축 -> 옵션맵)를 옵션(leaf) 단위로 펼치기
    const leaves: Array<{ condText: string; style: Record<string, any> }> = [];

    for (const vs of variantStyles) {
      if (!vs?.style || Object.keys(vs.style).length === 0) continue;

      // "Text#373:0" 같은 suffix 제거(있어도 무방)
      const axis = vs.variantName.split("#")[0].trim();

      const values = Object.values(vs.style);
      const looksLikeOptionMap = values.some(
        (v) => v && typeof v === "object" && !Array.isArray(v)
      );

      if (looksLikeOptionMap) {
        // 옵션맵: { L: {...}, M: {...} } 형태
        for (const [optionRaw, styleObj] of Object.entries(vs.style)) {
          if (
            !styleObj ||
            typeof styleObj !== "object" ||
            Array.isArray(styleObj)
          )
            continue;

          const option = String(optionRaw).split("#")[0].trim();
          leaves.push({
            condText: `${axis}=${option}`, // 예: "size=L"
            style: styleObj as Record<string, any>,
          });
        }
      } else {
        // 혹시 leaf style({height:"..", padding:".."})로 들어오는 경우 대응
        leaves.push({
          condText: axis,
          style: vs.style,
        });
      }
    }

    if (leaves.length === 0) return { base, dynamic: [] };

    // 2) base = 모든 leaf 스타일에서 공통으로 동일한 값인 속성만(intersection)
    const allKeys = new Set<string>();
    for (const leaf of leaves) {
      Object.keys(leaf.style).forEach((k) => allKeys.add(k));
    }

    for (const key of allKeys) {
      const first = leaves[0].style[key];
      if (first === undefined) continue;

      let ok = true;
      for (let i = 1; i < leaves.length; i++) {
        const v = leaves[i].style[key];
        if (v === undefined || v !== first) {
          ok = false;
          break;
        }
      }
      if (ok) base[key] = first;
    }

    // 3) dynamic = 각 leaf 스타일에서 base에 포함된 공통 속성은 제거하고 조건별로 저장
    for (const leaf of leaves) {
      const condition = this._parseVariantCondition(leaf.condText);
      if (!condition) continue;

      const diff: Record<string, any> = {};
      for (const [k, v] of Object.entries(leaf.style)) {
        if (base[k] === v) continue;
        diff[k] = v;
      }
      // if (Object.keys(diff).length === 0) continue;

      const key = leaf.condText; // 조건 문자열을 stable key로 사용
      const existing = dynamicMap.get(key);
      if (existing) {
        Object.assign(existing.style, diff);
      } else {
        dynamicMap.set(key, { condition, style: diff });
      }
    }

    return { base, dynamic: Array.from(dynamicMap.values()) };
  }

  private updateVisible(pivotNode: TempAstTree) {
    traverseBFS(pivotNode, (node, meta) => {
      const visible = this._inferVisible(node);
      node.visible = visible;
    });

    return pivotNode;
  }

  /**
   * 조건부 래퍼 패턴을 감지합니다.
   *
   * 패턴: 부모가 조건부인데, 자식 중 항상 존재하는 노드가 있는 경우
   * 예: Frame (visible: leftIcon || rightIcon)
   *       └── Text (visible: static true)
   *
   * 이 경우 Frame은 "조건부 래퍼"로 표시되고,
   * 코드 생성 시 조건에 따라 Fragment로 대체됩니다.
   */
  private updateConditionalWrapper(tempAstTree: TempAstTree) {
    traverseBFS(tempAstTree, (node) => {
      // 조건부 visible을 가진 노드만 검사
      if (node.visible?.type !== "condition") return;

      // 자식 중 "항상 존재"하는 노드가 있는지 확인
      const hasAlwaysVisibleChild = node.children.some((child) => {
        // static true이거나 null(명시적 바인딩으로 props에서 처리)
        return child.visible?.type === "static" && child.visible.value === true;
      });

      if (hasAlwaysVisibleChild) {
        node.isConditionalWrapper = true;
      }
    });

    return tempAstTree;
  }

  /**
   * visible 조건을 추론합니다.
   *
   * 1. 명시적 바인딩 확인 → props.visible에서 처리하므로 null 반환
   * 2. 모든 variant에서 존재 → { type: "static", value: true }
   * 3. 불리언 prop으로 추론 → { type: "condition", condition }
   * 4. mergedNode로 추론 → { type: "condition", condition }
   */
  private _inferVisible(targetNode: TempAstTree): VisibleValue | null {
    const componentPropertyDefinitions =
      this._specDataManager.getComponentPropertyDefinitions();
    const targetNodeData = this._specDataManager.getSpecById(targetNode.id);

    // 1. 명시적 바인딩이 있으면 props.visible에서 처리 → null
    if (targetNodeData.componentPropertyReferences?.visible) {
      return null;
    }

    // 2. 모든 variant에서 존재하면 항상 보임
    const totalVariantCount =
      this._specDataManager.getRenderTree().children.length;

    if (targetNode.mergedNode.length === totalVariantCount) {
      return {
        type: "static",
        value: true,
      };
    }

    if (!componentPropertyDefinitions) return null;

    // 3. 불리언 prop으로 추론 (True일 때만 보이는 경우)
    const booleanProps = helper.findBooleanVariantProps(
      componentPropertyDefinitions
    );
    for (const boolPropName of booleanProps) {
      if (this._isVisibleOnlyWhenBooleanTrue(targetNode, boolPropName)) {
        // 불리언 조건으로 변환: props.boolPropName === 'True'
        return {
          type: "condition",
          condition: helper.createBinaryCondition(boolPropName, "True"),
        };
      }
    }

    // 4. mergedNode로 추론 (일부 variant에서만 존재하는 경우)
    const condition = this._inferConditionFromMergedNode(targetNode);
    if (condition) {
      return { type: "condition", condition };
    }

    return null;
  }

  // Helper: 해당 불리언 속성이 True일 때만 노드가 존재하는지 확인
  private _isVisibleOnlyWhenBooleanTrue(
    node: TempAstTree,
    boolPropName: string
  ): boolean {
    // mergedNode의 key(variant name)를 파싱해서
    // boolPropName=True인 variant에서만 존재하는지 확인
    for (const merged of node.mergedNode) {
      const variantName = merged.variantName;

      if (!variantName) continue;

      const parsedVariant = helper.parseVariantName(variantName);

      // False인 variant에서도 존재하면 이 조건으로는 추론 불가
      if (parsedVariant[boolPropName].toLowerCase() === "false") {
        return false;
      }
    }
    return node.mergedNode.length > 0; // True인 variant에서만 존재
  }

  /**
   * "Property 1=Default, State=Hover" 형태의 문자열을 파싱하여 AST로 변환
   */
  private _parseVariantCondition(variantName: string): ConditionNode | null {
    if (!variantName) return null;

    const conditions: ConditionNode[] = variantName.split(",").map((part) => {
      const [key, value] = part.split("=").map((s) => s.trim());

      return {
        type: "BinaryExpression",
        operator: "===" as BinaryOperator,
        left: {
          type: "MemberExpression",
          object: {
            type: "Identifier",
            name: "props",
          },
          property: {
            type: "Identifier",
            name: key,
          },
          computed: false,
          optional: false,
        },
        right: {
          type: "Literal",
          value: value,
          raw: `'${value}'`,
        },
      } as unknown as ConditionNode;
    });

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];

    return conditions.reduce((acc, curr) => ({
      type: "BinaryExpression",
      operator: "&&" as BinaryOperator,
      left: acc,
      right: curr,
    })) as unknown as ConditionNode;
  }

  private _inferConditionFromMergedNode(
    targetNode: TempAstTree
  ): ConditionNode | null {
    const allVariants = this._specDataManager.getRenderTree().children;
    const totalVariantCount = allVariants.length;

    // 모든 variant에서 존재하면 조건 불필요
    if (targetNode.mergedNode.length >= totalVariantCount) {
      return null;
    }

    const definitions = this._specDataManager.getComponentPropertyDefinitions();
    if (!definitions) return null;

    // 1. 존재하는/존재하지 않는 variant 분리
    const presentVariantNames = new Set(
      targetNode.mergedNode.map((m) => m.variantName).filter(Boolean)
    );

    const absentVariants: Array<Record<string, string>> = [];
    for (const variant of allVariants) {
      if (!presentVariantNames.has(variant.name)) {
        absentVariants.push(helper.parseVariantName(variant.name));
      }
    }

    // 존재하지 않는 variant가 없으면 조건 불필요
    if (absentVariants.length === 0) {
      return null;
    }

    // 2. 전체 variant를 파싱해서 각 prop의 값 분포 확인
    const allParsedVariants = allVariants.map((v) =>
      helper.parseVariantName(v.name)
    );

    // 모든 variant에서 동일한 값을 가지는 prop 찾기 (이건 조건에서 제외해야 함)
    const invariantProps = new Set<string>();
    if (allParsedVariants.length > 0) {
      const firstVariant = allParsedVariants[0];
      for (const [propName, propValue] of Object.entries(firstVariant)) {
        const allSameInAllVariants = allParsedVariants.every(
          (v) => v[propName] === propValue
        );
        if (allSameInAllVariants) {
          invariantProps.add(propName);
        }
      }
    }

    // 3. 존재하지 않는 variant들의 공통 prop 값 찾기
    // (모든 absent variant에서 같은 값을 가지는 prop, 단 invariantProps는 제외)
    const commonAbsentValues: Record<string, string> = {};

    if (absentVariants.length > 0) {
      const firstAbsent = absentVariants[0];

      for (const [propName, propValue] of Object.entries(firstAbsent)) {
        // 모든 variant에서 동일한 prop은 제외 (visible 결정 요소 아님)
        if (invariantProps.has(propName)) continue;

        // 모든 absent variant에서 이 prop이 같은 값인지 확인
        const allSame = absentVariants.every(
          (variant) => variant[propName] === propValue
        );

        if (allSame) {
          commonAbsentValues[propName] = propValue;
        }
      }
    }

    // 공통점이 없으면 기존 로직으로 fallback
    if (Object.keys(commonAbsentValues).length === 0) {
      return this._inferConditionFromPresentVariants(targetNode, definitions);
    }

    // 3. 공통 absent 값의 반대 조건 생성 (OR로 연결)
    // absent가 "Left Icon=False AND Right Icon=False"이면
    // present는 "Left Icon=True OR Right Icon=True"
    const orConditions: ConditionNode[] = [];

    for (const [propName, absentValue] of Object.entries(commonAbsentValues)) {
      const def = definitions[propName];
      if (!def || !def.variantOptions) continue;

      // 이 prop의 다른 값들 (absent가 아닌 값들)
      const otherValues = def.variantOptions.filter((v) => v !== absentValue);

      if (otherValues.length === 1) {
        // 단일 값: props.LeftIcon === 'True'
        orConditions.push(
          helper.createBinaryCondition(propName, otherValues[0])
        );
      } else if (otherValues.length > 1) {
        // 복수 값: props.Size === 'Large' || props.Size === 'Medium'
        const multiConditions = otherValues.map((v) =>
          helper.createBinaryCondition(propName, v)
        );
        orConditions.push(helper.combineWithOr(multiConditions));
      }
    }

    if (orConditions.length === 0) return null;
    if (orConditions.length === 1) return orConditions[0];

    // 여러 prop의 조건은 OR로 연결
    // (Left Icon=True) OR (Right Icon=True)
    return helper.combineWithOr(orConditions);
  }

  /**
   * 기존 로직: 존재하는 variant 기반으로 조건 추론 (fallback)
   */
  private _inferConditionFromPresentVariants(
    targetNode: TempAstTree,
    definitions: Record<string, any>
  ): ConditionNode | null {
    // mergedNode의 variant name들에서 각 속성별 값 수집
    const presentValues: Record<string, Set<string>> = {};

    for (const merged of targetNode.mergedNode) {
      const variantName = merged.variantName;
      if (!variantName) continue;
      const parsed = helper.parseVariantName(variantName);

      for (const [prop, value] of Object.entries(parsed)) {
        if (!presentValues[prop]) presentValues[prop] = new Set();
        presentValues[prop].add(value);
      }
    }

    // 전체 옵션 대비 일부 값에서만 존재하는 속성들 찾기
    const conditions: ConditionNode[] = [];

    for (const [propName, def] of Object.entries(definitions)) {
      const allOptions = new Set(def.variantOptions);
      const presentOptions = presentValues[propName] || new Set();

      // 모든 옵션에서 존재하면 이 속성으로는 조건 추론 불가
      if (presentOptions.size === allOptions.size) continue;

      // 일부 옵션에서만 존재 → 조건 생성
      if (presentOptions.size === 1) {
        const value = [...presentOptions][0];
        conditions.push(helper.createBinaryCondition(propName, value));
      } else if (presentOptions.size > 1) {
        const orConditions = [...presentOptions].map((v) =>
          helper.createBinaryCondition(propName, v)
        );
        conditions.push(helper.combineWithOr(orConditions));
      }
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];

    return helper.combineWithAnd(conditions);
  }

  /**
   * 복합 조건(Size && Disabled)을 개별 prop별 조건으로 분리합니다.
   * 예: {Size: 'Large', Disabled: 'True'} → {height: 48px, background: yellow}
   * 결과: Size === 'Large' → {height: 48px}, Disabled === 'True' → {background: yellow}
   */
  private updateNormalizeStyle(tempAstTree: TempAstTree) {
    traverseBFS(tempAstTree, (node) => {
      const { base, dynamic } = node.style;

      if (dynamic.length === 0) return;

      // 1. 모든 dynamic 조건을 record 형태로 파싱
      const parsedDynamics = dynamic.map((d) => ({
        condition: helper.parseConditionToRecord(d.condition),
        style: d.style,
      }));

      // 2. 모든 스타일 키 수집
      const allStyleKeys = new Set<string>();
      for (const d of parsedDynamics) {
        Object.keys(d.style).forEach((k) => allStyleKeys.add(k));
      }

      // 3. 모든 prop 이름 수집
      const allPropNames = new Set<string>();
      for (const d of parsedDynamics) {
        Object.keys(d.condition).forEach((k) => allPropNames.add(k));
      }

      // 4. 각 스타일 키에 대해 어떤 prop이 결정하는지 분석
      const styleKeyToProp: Map<
        string,
        { propName: string; valueMap: Map<string, any> }
      > = new Map();

      for (const styleKey of allStyleKeys) {
        const determinedBy = this._findDeterminingProp(
          styleKey,
          parsedDynamics,
          allPropNames
        );
        if (determinedBy) {
          styleKeyToProp.set(styleKey, determinedBy);
        }
      }

      // 5. prop별로 조건을 그룹핑해서 새로운 dynamic 생성
      const newDynamic: Array<{
        condition: ConditionNode;
        style: Record<string, any>;
      }> = [];

      // prop별, propValue별로 스타일 그룹핑
      const propValueStyles: Map<
        string,
        Map<string, Record<string, any>>
      > = new Map();

      for (const [styleKey, { propName, valueMap }] of styleKeyToProp) {
        if (!propValueStyles.has(propName)) {
          propValueStyles.set(propName, new Map());
        }
        const propMap = propValueStyles.get(propName)!;

        for (const [propValue, styleValue] of valueMap) {
          if (!propMap.has(propValue)) {
            propMap.set(propValue, {});
          }
          propMap.get(propValue)![styleKey] = styleValue;
        }
      }

      // 조건 생성
      for (const [propName, valueMap] of propValueStyles) {
        for (const [propValue, style] of valueMap) {
          if (Object.keys(style).length > 0) {
            newDynamic.push({
              condition: helper.createBinaryCondition(propName, propValue),
              style,
            });
          }
        }
      }

      // 6. 결정되지 않은 스타일 키는 원래 복합 조건 유지
      const undeterminedKeys = [...allStyleKeys].filter(
        (k) => !styleKeyToProp.has(k)
      );

      if (undeterminedKeys.length > 0) {
        for (const d of dynamic) {
          const undeterminedStyle: Record<string, any> = {};
          for (const key of undeterminedKeys) {
            if (d.style[key] !== undefined) {
              undeterminedStyle[key] = d.style[key];
            }
          }
          if (Object.keys(undeterminedStyle).length > 0) {
            newDynamic.push({
              condition: d.condition,
              style: undeterminedStyle,
            });
          }
        }
      }

      node.style = { base, dynamic: newDynamic };
    });

    return tempAstTree;
  }

  /**
   * 특정 스타일 키가 어떤 prop에 의해 결정되는지 찾습니다.
   * 같은 prop 값일 때 항상 같은 스타일 값이면 해당 prop이 결정합니다.
   */
  private _findDeterminingProp(
    styleKey: string,
    parsedDynamics: Array<{
      condition: Record<string, string>;
      style: Record<string, any>;
    }>,
    allPropNames: Set<string>
  ): { propName: string; valueMap: Map<string, any> } | null {
    for (const propName of allPropNames) {
      // 이 prop의 각 값별로 스타일 값 수집
      const propValueToStyleValues: Map<string, Set<any>> = new Map();

      for (const d of parsedDynamics) {
        const propValue = d.condition[propName];
        const styleValue = d.style[styleKey];

        if (propValue === undefined || styleValue === undefined) continue;

        if (!propValueToStyleValues.has(propValue)) {
          propValueToStyleValues.set(propValue, new Set());
        }
        propValueToStyleValues.get(propValue)!.add(styleValue);
      }

      // 각 prop 값에 대해 스타일 값이 하나뿐인지 확인
      let allUnique = true;
      const valueMap = new Map<string, any>();

      for (const [propValue, styleValues] of propValueToStyleValues) {
        if (styleValues.size !== 1) {
          allUnique = false;
          break;
        }
        valueMap.set(propValue, [...styleValues][0]);
      }

      // 이 prop이 스타일을 결정하고, 값이 서로 다른지 확인
      if (allUnique && valueMap.size > 0) {
        const uniqueStyleValues = new Set(valueMap.values());
        // 모든 prop 값에서 스타일 값이 같으면 base로 가야 함 (이미 처리됨)
        // 다른 값이 있어야 이 prop이 결정한다고 볼 수 있음
        if (uniqueStyleValues.size > 1 || valueMap.size === 1) {
          return { propName, valueMap };
        }
      }
    }

    return null;
  }
}

export default _TempAstTree;
