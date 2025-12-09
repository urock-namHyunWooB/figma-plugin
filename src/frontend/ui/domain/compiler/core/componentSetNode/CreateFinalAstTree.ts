import SpecDataManager from "@compiler/manager/SpecDataManager";
import {
  TempAstTree,
  SuperTreeNode,
  FinalAstTree,
  StyleTree,
  StyleObject,
  VisibleValue,
} from "@compiler";
import { PropsDef } from "@compiler/core/componentSetNode/RefineProps";
import {
  ConditionNode,
  BinaryOperator,
} from "@frontend/ui/domain/compiler/types/customType";
import { findNodeBFS, traverseBFS } from "../../utils/traverse";
import debug from "@compiler/manager/DebuggingManager";
import { target } from "happy-dom/lib/PropertySymbol";

/**
 * 슈퍼트리에 각 variant 트리를 diff 해서 슈퍼트리 노드 하나하나 값을 채워나간다.
 */
class CreateFinalAstTree {
  private specDataManager: SpecDataManager;

  private _finalAstTree: FinalAstTree;
  private _tempAstTree: TempAstTree;

  public get finalAstTree() {
    return this._finalAstTree;
  }

  constructor(
    specDataManager: SpecDataManager,
    superTree: SuperTreeNode,
    refinedProps: PropsDef
  ) {
    this.specDataManager = specDataManager;

    this._tempAstTree = this.mergeVariantTrees(superTree, refinedProps);
  }

  private mergeVariantTrees(superTree: SuperTreeNode, refinedProps: PropsDef) {
    const specManager = this.specDataManager;
    let tempAstTree = this.createTempAstTree(superTree, refinedProps);

    const variantTrees = specManager.getRenderTree().children;

    tempAstTree = this.updateStyle(tempAstTree, variantTrees);
    tempAstTree = this.updateVisible(tempAstTree);

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
      const styleTree = this.specDataManager.getRenderTreeById(node.id);

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
     * targetTree 트리 순회하면서 pivotTree에 매칭(mergedNode) 되는 노드를 찾아서
     * 해당 노드에 스타일 diff 결괏값을 할당한다.
     */
    targetTrees.forEach((targetTree) => {
      const pivotVariantName = pivotTree.name;
      const targetVariantName = targetTree.figmaStyle!.name;

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
          matchedPivotNode.style = diffStyle;
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
    const targetNodeData = this.specDataManager.getSpecById(targetNode.id);

    if (targetNodeData.componentPropertyReferences?.visible) {
      return {
        type: "prop",
        name: targetNodeData.componentPropertyReferences.visible,
      };
    }

    const componentPropertyDefinitions =
      this.specDataManager.getComponentPropertyDefinitions();

    return null;
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
}

export default CreateFinalAstTree;
