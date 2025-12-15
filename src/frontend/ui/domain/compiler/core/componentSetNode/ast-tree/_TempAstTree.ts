import {
  ConditionNode,
  StyleObject,
  StyleTree,
  SuperTreeNode,
  TempAstTree,
  VisibleValue,
} from "@compiler";
import { PropsDef } from "@compiler/core/componentSetNode/RefineProps";

import SpecDataManager from "../../../manager/SpecDataManager";
import { findNodeBFS, traverseBFS } from "@compiler/utils/traverse";
import helper from "@compiler/manager/HelperManager";
import { BinaryOperator } from "@compiler/types/customType";
import debug from "@compiler/manager/DebuggingManager";

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
    tempAstTree = this.updateStyle(tempAstTree, variantTrees);
    tempAstTree = this.updateNormalizeStyle(tempAstTree);
    tempAstTree = this.updateVisible(tempAstTree);
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

  /**
   * 모든 variant의 스타일을 한번에 분석하여 pivotTree에 적용
   * - 모든 variant에서 동일한 값 → base
   * - variant별로 다른 값 → 각 조건의 dynamic
   */
  private updateStyle(pivotTree: TempAstTree, targetTrees: StyleTree[]) {
    traverseBFS(pivotTree, (pivotNode) => {
      // 이 pivotNode에 매칭되는 모든 variant의 스타일 수집
      const variantStyles: Array<{
        variantName: string;
        style: Record<string, any>;
      }> = [];

      for (const targetTree of targetTrees) {
        const targetVariantName = targetTree.name;
        if (!targetVariantName) {
          console.warn("targetVariantName is null", targetTree);
          continue;
        }

        // targetTree에서 pivotNode에 매칭되는 노드 찾기
        const matchedTargetNode = findNodeBFS(targetTree, (targetNode) =>
          pivotNode.mergedNode.some((merged) => merged.id === targetNode.id)
        );

        if (matchedTargetNode) {
          variantStyles.push({
            variantName: targetVariantName,
            style: matchedTargetNode.cssStyle || {},
          });
        }
      }

      // 모든 variant 스타일을 분석해서 base/dynamic 결정
      if (variantStyles.length > 0) {
        pivotNode.style = this._computeStyleFromVariants(variantStyles);
      }
    });

    return pivotTree;
  }

  /**
   * 여러 variant의 스타일을 분석하여 base와 dynamic을 계산합니다.
   */
  private _computeStyleFromVariants(
    variantStyles: Array<{ variantName: string; style: Record<string, any> }>
  ): StyleObject {
    const base: Record<string, any> = {};
    const dynamic: Array<{
      condition: ConditionNode;
      style: Record<string, any>;
    }> = [];

    if (variantStyles.length === 0) {
      return { base, dynamic };
    }

    // 모든 스타일 키 수집
    const allKeys = new Set<string>();
    for (const vs of variantStyles) {
      Object.keys(vs.style).forEach((k) => allKeys.add(k));
    }

    for (const key of allKeys) {
      // 각 variant에서의 값 수집 (undefined면 해당 variant에 없는 것)
      const valuesWithVariant = variantStyles.map((vs) => ({
        variantName: vs.variantName,
        value: vs.style[key],
      }));

      // 값이 있는 것들만 필터
      const definedValues = valuesWithVariant.filter(
        (v) => v.value !== undefined
      );

      if (definedValues.length === 0) continue;

      const firstValue = definedValues[0].value;
      const allSame =
        definedValues.length === variantStyles.length &&
        definedValues.every((v) => v.value === firstValue);

      if (allSame) {
        // 모든 variant에서 같은 값 → base에 추가
        base[key] = firstValue;
      } else {
        // variant별로 다름 → 각 조건의 dynamic에 추가
        for (const item of definedValues) {
          const condition = this._parseVariantCondition(item.variantName);
          if (!condition) continue;

          // 해당 condition의 dynamic 항목 찾기 또는 생성
          let existingDynamic = dynamic.find(
            (d) => JSON.stringify(d.condition) === JSON.stringify(condition)
          );

          if (!existingDynamic) {
            existingDynamic = { condition, style: {} };
            dynamic.push(existingDynamic);
          }

          existingDynamic.style[key] = item.value;
        }
      }
    }

    return { base, dynamic };
  }

  private updateVisible(pivotNode: TempAstTree) {
    traverseBFS(pivotNode, (node, meta) => {
      const visible = this._inferVisible(node);
      node.visible = visible;
    });

    return pivotNode;
  }

  /**
   * 1. 명시적 바인딩 확인
   * componentPropertyReferences.visible을 확인
   * name 값이 존재하면 {type:'prop', name: name}
   *
   * 2. 불리언 속성 추론
   * variant 속성중 True/False 같은 불리언 속성을 갖고
   * 해당 variant에서 True일때만 노드가 보이고 False 일땐 노드가 없다면
   * {type: prop, name: variant name}
   *
   * 3. mergedNode로 추론
   * mergedNode 값에 따라서 추론
   */
  private _inferVisible(targetNode: TempAstTree): VisibleValue | null {
    const componentPropertyDefinitions =
      this._specDataManager.getComponentPropertyDefinitions();
    const targetNodeData = this._specDataManager.getSpecById(targetNode.id);

    if (targetNodeData.componentPropertyReferences?.visible) {
      return {
        type: "prop",
        name: targetNodeData.componentPropertyReferences.visible,
      };
    }

    if (
      targetNode.mergedNode.length ===
      this._specDataManager.getRenderTree().children.length
    ) {
      return {
        type: "static",
        value: true,
      };
    }

    if (!componentPropertyDefinitions) return null;

    //TODO 여기 로직 맞는지 검증 한번 해봐야함.
    const booleanProps = helper.findBooleanVariantProps(
      componentPropertyDefinitions
    );
    for (const boolPropName of booleanProps) {
      if (this._isVisibleOnlyWhenBooleanTrue(targetNode, boolPropName)) {
        return { type: "prop", name: boolPropName };
      }
    }

    // 3. mergedNode로 추론 (일부 variant에서만 존재하는 경우)
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
    const totalVariantCount =
      this._specDataManager.getRenderTree().children.length;

    // 모든 variant에서 존재하면 조건 불필요
    if (targetNode.mergedNode.length >= totalVariantCount) {
      return null;
    }

    const definitions = this._specDataManager.getComponentPropertyDefinitions();
    if (!definitions) return null;

    // 1. mergedNode의 variant name들에서 각 속성별 값 수집
    const presentValues: Record<string, Set<string>> = {};

    for (const merged of targetNode.mergedNode) {
      const variantName = merged.variantName;
      if (!variantName) continue;
      const parsed = helper.parseVariantName(variantName); // { Size: "Large", State: "Hover" }

      for (const [prop, value] of Object.entries(parsed)) {
        if (!presentValues[prop]) presentValues[prop] = new Set();
        presentValues[prop].add(value);
      }
    }

    // 2. 전체 옵션 대비 일부 값에서만 존재하는 속성들 찾기
    const conditions: ConditionNode[] = [];

    for (const [propName, def] of Object.entries(definitions)) {
      const allOptions = new Set(def.variantOptions);
      const presentOptions = presentValues[propName] || new Set();

      // 모든 옵션에서 존재하면 이 속성으로는 조건 추론 불가
      if (presentOptions.size === allOptions.size) continue;

      // 일부 옵션에서만 존재 → 조건 생성
      if (presentOptions.size === 1) {
        // 단일 값: props.Left Icon === 'True'
        const value = [...presentOptions][0];
        conditions.push(helper.createBinaryCondition(propName, value));
      } else {
        // 복수 값: props.State === 'Hover' || props.State === 'Pressed'
        const orConditions = [...presentOptions].map((v) =>
          helper.createBinaryCondition(propName, v)
        );
        conditions.push(helper.combineWithOr(orConditions));
      }
    }

    // 3. 조건들을 AND로 연결
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
