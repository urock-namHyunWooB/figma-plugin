import SpecDataManager from "@compiler/manager/SpecDataManager";
import { FinalAstTree, MergedNode, StyleObject, TempAstTree } from "@compiler";
import HelperManager from "@compiler/manager/HelperManager";
import { traverseTree } from "@figma/eslint-plugin-figma-plugins/dist/util";
import { traverseBFS } from "@compiler/utils/traverse";
import { toCamelCase } from "@compiler/utils/normalizeString";
import { generate } from "astring";
import { value } from "happy-dom/lib/PropertySymbol";

import * as estraverse from "estraverse";
import debug from "@compiler/manager/DebuggingManager";

/**
 * 값을 목적에 맞게 가공하는 역할
 */
class _FinalAstTree {
  private _finalAstTree: FinalAstTree;

  private specDataManager: SpecDataManager;

  public get finalAstTree() {
    return this._finalAstTree;
  }

  constructor(specDataManager: SpecDataManager, tempAstTree: TempAstTree) {
    this.specDataManager = specDataManager;

    let finalAstTree = this.createFinalAstTree(tempAstTree);
    finalAstTree = this.updateCleanupNodes(finalAstTree);
    finalAstTree = this.updateProps(finalAstTree);

    this._finalAstTree = finalAstTree;
  }

  private createFinalAstTree(tempAstTree: TempAstTree): FinalAstTree {
    const convert = (
      node: TempAstTree,
      parent: FinalAstTree | null
    ): FinalAstTree => {
      const finalNode: FinalAstTree = {
        id: node.id,
        name: node.name,
        type: node.type,
        props: { ...node.props },
        parent: parent,
        visible: node.visible ?? { type: "static", value: true },
        style: node.style,
        children: [],
      };

      finalNode.children = node.children.map((child) =>
        convert(child, finalNode)
      );

      return finalNode;
    };

    return convert(tempAstTree, null);
  }

  /**
   * 불필요한 노드 삭제
   * 높이값이 0인 노드 삭제 (absoluteBoundingBox)
   * @param astTree
   * @private
   */
  private updateCleanupNodes(astTree: FinalAstTree) {
    const nodesToRemove: FinalAstTree[] = [];

    // 1. 삭제할 노드 수집
    traverseBFS(astTree, (node, meta) => {
      const targetSpec = this.specDataManager.getSpecById(node.id);
      if (targetSpec.absoluteBoundingBox?.height === 0) {
        nodesToRemove.push(node);
      }
    });

    // 2. 수집된 노드들을 트리에서 제거
    nodesToRemove.forEach((node) => {
      if (node.parent) {
        node.parent.children = node.parent.children.filter(
          (child) => child !== node
        );
      }
    });

    return astTree;
  }

  /**
   * 최적의 스타일을 세팅한다.
   * @param astTree
   * @private
   */
  private updateStyle(astTree: FinalAstTree) {
    return astTree;
  }

  /**
   * 메타 데이터 추가
   * 유사한 태그 유추
   * @param astTree
   * @private
   */
  private updateMetaData(astTree: FinalAstTree) {}

  /**
   * visible 최적화
   * @param astTree
   * @private
   */
  private updateVisible(astTree: FinalAstTree) {}

  /**
   * Props 최적화
   * 유효하지 않는 name을 가공
   * props에 state 있으면 삭제하고 바인딩된 노드를 찾아서 수정한다.
   * @param astTree
   * @private
   */
  private updateProps(astTree: FinalAstTree) {
    astTree = this._normalizePropsName(astTree);
    astTree = this._refineStateProp(astTree);
  }

  private _refineStateProp(astTree: FinalAstTree) {
    traverseBFS(astTree, (node) => {
      if (node.visible.type === "condition") {
        // console.log(node.type, node.props, generate(node.visible.condition));
      } else {
        // console.log(node.type, node.props, node.visible);
      }
    });
    return astTree;
  }

  private _normalizePropsName(astTree: FinalAstTree) {
    const propsHashMap = Object.entries(astTree.props)
      .map((value) => {
        return value[0];
      })
      .reduce(
        (acc, cur) => {
          acc[cur] = [];
          return acc;
        },
        {} as Record<string, any[]>
      );

    traverseBFS(astTree, (node) => {
      for (const prop in node.props) {
        if (node.type === "COMPONENT") continue;

        const value = node.props[prop];
        if (propsHashMap[value]) {
          propsHashMap[value].push(node.props);
        }

        if (node.visible.type === "condition") {
          const names = [
            ...generate(node.visible.condition).matchAll(
              /\.([A-Za-z_$][\w$]*)/g
            ),
          ].map((m) => m[1]);

          for (const name of names) {
            if (propsHashMap[name]) {
              propsHashMap[name].push(node.visible);
              break;
            }
          }
        }
      }
    });

    for (const propsKey in astTree.props) {
      astTree.props[toCamelCase(propsKey)] = astTree.props[propsKey];
      delete astTree.props[propsKey];
    }

    for (const propsKey in propsHashMap) {
      propsHashMap[propsKey].forEach((value) => {
        //visible condition 처리
        if (value.type && value.condition) {
          estraverse.traverse(value.condition, {
            enter(node) {
              if (node.type === "Identifier") {
                console.log(toCamelCase(node.name));
                node.name = toCamelCase(node.name);
              }
            },
          });
        } else {
          Object.keys(value).forEach((key) => {
            value[key] = toCamelCase(value[key]);
          });
        }

        console.log(value);
      });
    }

    return astTree;
  }

  /**
   * 노드 트리 구조 최적화
   * @private
   */
  private updateStructure() {}
}

export default _FinalAstTree;
