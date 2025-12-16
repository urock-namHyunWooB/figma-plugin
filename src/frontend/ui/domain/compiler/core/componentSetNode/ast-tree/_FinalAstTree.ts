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

    return astTree;
  }

  private _refineStateProp(astTree: FinalAstTree) {
    traverseBFS(astTree, (node) => {
      if (node.visible.type === "condition") {
        console.log(node.type, node.props, generate(node.visible.condition));
      } else {
        console.log(node.type, node.props, node.visible);
      }
    });
    return astTree;
  }

  /**
   * 모든 node 순회해서 props에 해당하는 유효하지 않는 name을 카멜케이스로 바꾼다.
   * props, visible 탐색
   * @param astTree
   * @private
   */
  private _normalizePropsName(astTree: FinalAstTree) {
    const propKeys = Object.keys(astTree.props);
    const propRefs: Record<string, any[]> = Object.fromEntries(
      propKeys.map((key) => [key, []])
    );

    // 1. prop을 참조하는 노드 수집
    traverseBFS(astTree, (node) => {
      if (node.type === "COMPONENT") return;

      // props 값에서 참조 수집
      for (const key in node.props) {
        const value = node.props[key];
        if (propRefs[value]) {
          propRefs[value].push(node.props);
        }
      }

      // visible condition에서 참조 수집
      if (node.visible.type === "condition") {
        const code = generate(node.visible.condition);
        const identifiers = [...code.matchAll(/\.([A-Za-z_$][\w$]*)/g)].map(
          (m) => m[1]
        );

        const matchedKey = identifiers.find((name) => propRefs[name]);
        if (matchedKey) {
          propRefs[matchedKey].push(node.visible);
        }
      }
    });

    // 2. 루트 props 키를 camelCase로 변환
    for (const key of propKeys) {
      astTree.props[toCamelCase(key)] = astTree.props[key];
      delete astTree.props[key];
    }

    // 3. 수집된 참조들도 camelCase로 변환
    for (const key in propRefs) {
      for (const ref of propRefs[key]) {
        if (ref.type === "condition" && ref.condition) {
          estraverse.traverse(ref.condition, {
            enter(node) {
              if (node.type === "Identifier") {
                node.name = toCamelCase(node.name);
              }
            },
          });
        } else {
          for (const k of Object.keys(ref)) {
            ref[k] = toCamelCase(ref[k]);
          }
        }
      }
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
