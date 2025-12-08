import SpecDataManager from "@compiler/manager/SpecDataManager";
import { TempAstTree, SuperTreeNode, FinalAstTree, StyleTree } from "@compiler";
import { PropsDef } from "@compiler/core/componentSetNode/RefineProps";
import {
  ConditionNode,
  BinaryOperator,
} from "@frontend/ui/domain/compiler/types/customType";

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
    console.log("this._tempAstTree", this._tempAstTree);
  }

  private mergeVariantTrees(superTree: SuperTreeNode, refinedProps: PropsDef) {
    const specManager = this.specDataManager;
    const tempAstTree = this.createTempAstTree(superTree, refinedProps);

    const variantTrees = specManager.getRenderTree().children;

    variantTrees.forEach((variantTree) => {
      this._mergeTree(tempAstTree, variantTree);
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
        children,
      } as TempAstTree;
    };

    return convert(superTree, true);
  }

  private _mergeTree(pivotTree: TempAstTree, targetTree: StyleTree) {
    if (pivotTree.name === targetTree.figmaStyle?.name) return pivotTree;

    // 변경 후 제안
    const pivotCss = pivotTree.style.base;
    const targetCss = targetTree.cssStyle;
    const pivotName = pivotTree.name;
    const targetName = targetTree.figmaStyle!.name;

    if (!targetName) {
      console.warn(`targetTree ${targetTree.id} is not have figmaStyle name`);
    }

    const diff = this._diffStyle(pivotCss, targetCss, pivotName, targetName);

    console.log("diff", diff);

    // TODO: diff 결과를 pivotTree에 적용하는 로직 필요
    // pivotTree.style.base = diff.base;
    // pivotTree.style.dynamic.push(...diff.dynamic);
  }

  private _diffStyle(
    pivotStyle: Record<string, any>,
    targetStyle: Record<string, any>,
    pivotName: string,
    targetName: string
  ) {
    const diff = {
      base: {} as Record<string, any>,
      dynamic: [] as Array<{
        condition: ConditionNode;
        style: Record<string, any>;
      }>,
    };

    const pivotCondition = this._parseVariantCondition(pivotName);
    const targetCondition = this._parseVariantCondition(targetName);

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
