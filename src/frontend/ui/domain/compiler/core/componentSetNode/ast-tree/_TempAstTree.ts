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

    debug.tree(tempAstTree);
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
   * pivotTree와 targetTree 두 트리 diff해서 pivotTree style 적용
   * @param pivotTree
   * @param targetTrees
   * @private
   */
  private updateStyle(pivotTree: TempAstTree, targetTrees: StyleTree[]) {
    /**
     * targetTree 트리 순회하면서 pivotTree에 mergedNode 된 노드들을 분석해서
     * 해당 노드에 스타일 diff 결괏값을 할당한다.
     * (어떤 variant 일때 어떤 스타일이 바뀌는지 정보를 알기 위해서)
     */
    targetTrees.forEach((targetTree) => {
      const pivotVariantName = pivotTree.name;
      const targetVariantName = targetTree.name;

      if (!targetVariantName) {
        console.warn("targetVariantName is null", targetTree);
      }

      traverseBFS(targetTree, (targetNode, targetMeta) => {
        const matchedPivotNode = findNodeBFS(pivotTree, (pivotNode) => {
          return pivotNode.mergedNode.some((merged) =>
            Object.values(merged).includes(targetNode.id)
          );
        });

        if (matchedPivotNode) {
          const diffStyle = this._getDiffStyle(
            matchedPivotNode,
            targetNode,
            pivotVariantName,
            targetVariantName
          );

          if (matchedPivotNode.style) {
            matchedPivotNode.style.base = diffStyle.base;
            matchedPivotNode.style.dynamic.push(...diffStyle.dynamic);
          } else {
            matchedPivotNode.style = diffStyle;
          }
        }
      });
    });

    return pivotTree;
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

  private _getDiffStyle(
    pivotNode: TempAstTree,
    targetNode: StyleTree,
    pivotVariantName: string,
    targetVariantName: string
  ) {
    if (pivotNode.id === targetNode.id) {
      return pivotNode.style;
    }

    const pivotCss = pivotNode.style.base;
    const targetCss = targetNode.cssStyle;

    const diff = this._diffStyle(
      pivotCss,
      targetCss,
      pivotVariantName,
      targetVariantName
    );

    return diff;
  }

  private _diffStyle(
    pivotStyle: Record<string, any>,
    targetStyle: Record<string, any>,
    pivotVariantName: string,
    targetVariantName: string
  ) {
    const diff: StyleObject = {
      base: {},
      dynamic: [],
    };

    const pivotCondition = this._parseVariantCondition(pivotVariantName);
    const targetCondition = this._parseVariantCondition(targetVariantName);

    const dynamicA: Record<string, any> = {};
    const dynamicB: Record<string, any> = {};

    const allKeys = new Set([
      ...Object.keys(pivotStyle),
      ...Object.keys(targetStyle),
    ]);

    allKeys.forEach((key) => {
      const inPivot = Object.prototype.hasOwnProperty.call(pivotStyle, key);
      const inTarget = Object.prototype.hasOwnProperty.call(targetStyle, key);
      const pivotValue = pivotStyle[key];
      const targetValue = targetStyle[key];

      if (inPivot && inTarget) {
        if (pivotValue === targetValue) {
          /**
           * 1. A,B 둘 다 있고 값도 같으면 base에 해당 style 넣기
           */
          diff.base[key] = pivotValue;
        } else {
          /**
           * 2. A,B 둘다 있지만 값이 서로 다르면 base에 A값 넣고 dynamic에 B 넣기
           * (A값은 Default로서 base에 유지, B값은 조건부 적용)
           */
          diff.base[key] = pivotValue;
          dynamicB[key] = targetValue;
        }
      } else if (inPivot) {
        /**
         * 3. A에만 있으면 dynamic에 A에 넣기
         * (B에는 없으므로, A 조건일 때만 적용되어야 함 -> base에서 제거됨)
         */
        dynamicA[key] = pivotValue;
      } else if (inTarget) {
        /**
         * 4. B에만 있으면 dynamic에 B에 넣기
         */
        dynamicB[key] = targetValue;
      }
    });

    // dynamic 스타일이 존재하는 경우에만 추가
    if (Object.keys(dynamicA).length > 0 && pivotCondition) {
      diff.dynamic.push({
        condition: pivotCondition,
        style: dynamicA,
      });
    }

    if (Object.keys(dynamicB).length > 0 && targetCondition) {
      diff.dynamic.push({
        condition: targetCondition,
        style: dynamicB,
      });
    }

    return diff;
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

  private updateNormalizeStyle(tempAstTree: TempAstTree) {
    traverseBFS(tempAstTree, (node) => {
      //TODO 결괏값 어떻게 나와야 하는지 먼저 정리하자.

      for (const dynamic of node.style.dynamic) {
        const condition = helper.parseConditionToRecord(dynamic.condition);
        console.log(condition, dynamic.style);
      }
      console.log(node.style.base);
      console.log("/////////////");
    });

    return tempAstTree;
  }
}

export default _TempAstTree;
