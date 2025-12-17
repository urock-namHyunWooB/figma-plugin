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
    astTree = this._refineComponentLikeProp(astTree);

    return astTree;
  }

  /**
   * ComponentLike 타입의 prop을 최적화한다.
   * Slot 후보 Props 찾기
   * Slot 바인딩 확인
   * Slot 바인딩된 노드 처리
   * @param astTree
   * @returns
   */
  private _refineComponentLikeProp(astTree: FinalAstTree) {
    // 1. Slot 후보 Props 찾기 (BOOLEAN 또는 True/False VARIANT)
    const slotCandidateProps = Object.entries(astTree.props)
      .filter(([key, value]: [string, any]) => {
        // BOOLEAN 타입
        if (value.type === "BOOLEAN") return true;

        // True/False VARIANT 타입 (대소문자 모두 처리)
        if (value.type === "VARIANT") {
          const options = (value.variantOptions || []).map((o: string) =>
            o.toLowerCase()
          );
          return (
            options.length === 2 &&
            options.includes("true") &&
            options.includes("false")
          );
        }
        return false;
      })
      .map(([key, value]: [string, any]) => ({ key, type: value.type }));

    // 2. slot prop과 바인딩된 INSTANCE 노드 찾기
    const slotBindings: Map<
      string,
      { propName: string; node: FinalAstTree; bindingType: string }
    > = new Map();

    // 모든 INSTANCE 노드 수집 (위치 정보 포함)
    const instanceNodes: {
      node: FinalAstTree;
      x: number;
      y: number;
      normalizedName: string;
    }[] = [];

    traverseBFS(astTree, (node) => {
      if (node.type === "INSTANCE") {
        const targetSpec = this.specDataManager.getSpecById(node.id);
        const box = targetSpec?.absoluteBoundingBox;
        instanceNodes.push({
          node,
          x: box?.x ?? 0,
          y: box?.y ?? 0,
          normalizedName: node.name.toLowerCase().replace(/[_\s-]+/g, ""),
        });
      }
    });

    // 패턴 A: visible condition 바인딩 확인
    for (const { node } of instanceNodes) {
      if (node.visible.type === "condition") {
        const conditionCode = generate(node.visible.condition);

        for (const { key: propName } of slotCandidateProps) {
          const patterns = [
            new RegExp(
              `props\\.${propName}\\s*(===|==)\\s*(true|'True'|"True")`,
              "i"
            ),
            new RegExp(
              `props\\['${propName}'\\]\\s*(===|==)\\s*(true|'True'|"True")`,
              "i"
            ),
          ];

          if (patterns.some((p) => p.test(conditionCode))) {
            if (!slotBindings.has(propName)) {
              slotBindings.set(propName, {
                propName,
                node,
                bindingType: "visible_condition",
              });
            }
            break;
          }
        }
      }
    }

    // 패턴 B: 노드 이름 매칭 바인딩 확인 (아직 바인딩 안된 것만)
    for (const { node, normalizedName } of instanceNodes) {
      if (node.visible.type === "static") {
        for (const { key: propName } of slotCandidateProps) {
          if (slotBindings.has(propName)) continue;

          // B-1: 노드 이름이 prop 이름을 포함 (예: "lefticon" includes "lefticon")
          if (normalizedName.includes(propName.toLowerCase())) {
            slotBindings.set(propName, {
              propName,
              node,
              bindingType: "name_matching",
            });
            break;
          }
        }
      }
    }

    // 패턴 C: 위치 기반 매칭 (여러 동일 이름 노드와 left/right prop 매칭)
    // 아직 바인딩되지 않은 slot prop 중 left/right 키워드가 있는 것들 찾기
    const unboundProps = slotCandidateProps.filter(
      (p) => !slotBindings.has(p.key)
    );

    // left/right 위치 키워드를 포함하는 prop 쌍 찾기
    const leftProp = unboundProps.find((p) =>
      p.key.toLowerCase().includes("left")
    );
    const rightProp = unboundProps.find((p) =>
      p.key.toLowerCase().includes("right")
    );

    if (leftProp || rightProp) {
      // 아직 바인딩되지 않은 INSTANCE 노드 중 공통 키워드(icon 등)를 가진 것들 찾기
      const boundNodeIds = new Set(
        [...slotBindings.values()].map((b) => b.node.id)
      );

      // 공통 키워드 추출 (예: iconLeft, iconRight에서 "icon" 추출)
      const keyword = this._extractCommonKeyword([
        leftProp?.key,
        rightProp?.key,
      ]);

      if (keyword) {
        const matchingUnboundNodes = instanceNodes
          .filter(
            ({ node, normalizedName }) =>
              !boundNodeIds.has(node.id) && normalizedName.includes(keyword)
          )
          .sort((a, b) => a.x - b.x); // x 좌표로 정렬 (왼쪽 → 오른쪽)

        if (matchingUnboundNodes.length >= 2) {
          // 가장 왼쪽 노드 → leftProp
          if (leftProp) {
            const leftNode = matchingUnboundNodes[0];
            slotBindings.set(leftProp.key, {
              propName: leftProp.key,
              node: leftNode.node,
              bindingType: "positional_left",
            });
          }

          // 가장 오른쪽 노드 → rightProp
          if (rightProp) {
            const rightNode =
              matchingUnboundNodes[matchingUnboundNodes.length - 1];
            slotBindings.set(rightProp.key, {
              propName: rightProp.key,
              node: rightNode.node,
              bindingType: "positional_right",
            });
          }
        } else if (matchingUnboundNodes.length === 1) {
          // 노드가 1개뿐인 경우, 매칭되는 prop에 바인딩
          const singleNode = matchingUnboundNodes[0];
          const propToUse = leftProp || rightProp;
          if (propToUse) {
            slotBindings.set(propToUse.key, {
              propName: propToUse.key,
              node: singleNode.node,
              bindingType: "keyword_matching",
            });
          }
        }
      }
    }

    // 4. slot으로 확정된 props 변환
    // TODO: props 타입 구조 확인 후 실제 변환 로직 구현
    for (const [propName, binding] of slotBindings) {
      const propDef = astTree.props[propName] as any;
      if (!propDef) continue;

      // prop 타입을 SLOT으로 변환
      (astTree.props as any)[propName] = {
        type: "SLOT",
        defaultValue: null,
        originalType: propDef.type,
      };

      // 바인딩된 노드 처리
      const { node } = binding;

      // visible condition 제거 (항상 보이도록)
      node.visible = { type: "static", value: true };

      // 노드를 slot 렌더링 노드로 표시
      (node as any).slotName = propName;
      (node as any).isSlot = true;
    }

    return astTree;
  }

  /**
   * prop 이름들에서 공통 키워드 추출
   * 예: ["iconLeft", "iconRight"] → "icon"
   */
  private _extractCommonKeyword(
    propNames: (string | undefined)[]
  ): string | null {
    const validNames = propNames.filter((n): n is string => !!n);
    if (validNames.length === 0) return null;

    // 소문자로 변환 후 공통 접두사/키워드 찾기
    const lowerNames = validNames.map((n) => n.toLowerCase());

    // 간단한 접근: 첫 번째 이름에서 위치 키워드 제거
    const firstWithoutPosition = lowerNames[0]
      .replace(/left|right|top|bottom|start|end/gi, "")
      .trim();

    if (firstWithoutPosition.length >= 2) {
      return firstWithoutPosition;
    }

    return null;
  }

  private _refineStateProp(astTree: FinalAstTree) {
    traverseBFS(astTree, (node) => {
      if (node.visible.type === "condition") {
      } else {
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

      // visible condition에서 참조 수집 (공백 포함 prop 이름 처리)
      if (node.visible.type === "condition") {
        const code = generate(node.visible.condition);

        // props.XXX === 'YYY' 패턴에서 XXX 추출 (공백 포함)
        // 예: "props.Left Icon === 'True'" → "Left Icon"
        const propMatches = [
          ...code.matchAll(/props\.([^=!<>\s]+(?:\s+[^=!<>\s]+)*)\s*[=!<>]/g),
        ];

        for (const match of propMatches) {
          const extractedName = match[1].trim();
          // 원본 propKeys에서 매칭되는 키 찾기
          if (propRefs[extractedName]) {
            propRefs[extractedName].push(node.visible);
          }
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
          // AST traverse로 Identifier 변환
          estraverse.traverse(ref.condition, {
            enter(node) {
              if (node.type === "Identifier") {
                node.name = toCamelCase(node.name);
              }
            },
          });

          // 추가: generate된 코드에서 공백 포함 prop 이름을 camelCase로 변환
          // MemberExpression의 computed property도 처리
          this._normalizeConditionPropNames(ref.condition, propKeys);
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
   * condition AST에서 공백이 포함된 prop 이름을 camelCase로 변환
   * @param condition
   * @param originalPropKeys
   * @private
   */
  private _normalizeConditionPropNames(
    condition: any,
    originalPropKeys: string[]
  ) {
    estraverse.traverse(condition, {
      enter(node: any) {
        // MemberExpression: props.XXX 또는 props["XXX"]
        if (node.type === "MemberExpression") {
          const obj = node.object;
          const prop = node.property;

          // props.XXX 형태 (공백 있는 이름이 여러 Identifier로 파싱된 경우는 generate에서 처리됨)
          if (
            obj?.type === "Identifier" &&
            obj?.name === "props" &&
            prop?.type === "Identifier"
          ) {
            // 원본 prop 이름 중 현재 Identifier와 매칭되는 것 찾기
            const matchedOriginal = originalPropKeys.find((key) => {
              // "Left Icon" → "Left" (첫 단어)와 매칭되는지 확인
              const firstWord = key.split(" ")[0];
              return firstWord === prop.name || key === prop.name;
            });

            if (matchedOriginal) {
              // 전체 이름을 camelCase로 변환
              prop.name = toCamelCase(matchedOriginal);
            }
          }
        }
      },
    });
  }

  /**
   * 노드 트리 구조 최적화
   * @private
   */
  private updateStructure() {}
}

export default _FinalAstTree;
