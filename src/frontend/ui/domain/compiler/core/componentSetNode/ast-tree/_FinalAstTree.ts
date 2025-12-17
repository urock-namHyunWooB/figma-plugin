import SpecDataManager from "@compiler/manager/SpecDataManager";
import {
  FinalAstTree,
  MergedNode,
  StyleObject,
  TempAstTree,
  ConditionNode,
  VisibleValue,
} from "@compiler";
import HelperManager from "@compiler/manager/HelperManager";
import { traverseTree } from "@figma/eslint-plugin-figma-plugins/dist/util";
import { traverseBFS } from "@compiler/utils/traverse";
import { toCamelCase } from "@compiler/utils/normalizeString";
import { generate } from "astring";
import { value } from "happy-dom/lib/PropertySymbol";

import * as estraverse from "estraverse";
import debug from "@compiler/manager/DebuggingManager";

type SlotCandidateProp = { key: string; type: string };
type SlotBinding = {
  propName: string;
  node: FinalAstTree;
  bindingType: string;
};
type NodeInfo = {
  node: FinalAstTree;
  x: number;
  y: number;
  normalizedName: string;
};

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
   * Slot 후보 Props 찾기 → Slot 바인딩 확인 → Slot 바인딩된 노드 처리
   */
  private _refineComponentLikeProp(astTree: FinalAstTree) {
    const slotCandidateProps = this._findSlotCandidateProps(astTree.props);
    const allNodes = this._collectAllNodes(astTree);
    const slotBindings = this._findSlotBindings(slotCandidateProps, allNodes);
    this._convertPropsToSlots(astTree, slotBindings);

    return astTree;
  }

  /**
   * Slot 후보 Props 찾기 (BOOLEAN 또는 True/False VARIANT)
   */
  private _findSlotCandidateProps(
    props: Record<string, any>
  ): SlotCandidateProp[] {
    return Object.entries(props)
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
  }

  /**
   * 모든 노드 수집 (위치 정보 포함)
   */
  private _collectAllNodes(astTree: FinalAstTree): NodeInfo[] {
    const allNodes: NodeInfo[] = [];

    traverseBFS(astTree, (node) => {
      const targetSpec = this.specDataManager.getSpecById(node.id);
      const box = targetSpec?.absoluteBoundingBox;
      allNodes.push({
        node,
        x: box?.x ?? 0,
        y: box?.y ?? 0,
        normalizedName: node.name.toLowerCase().replace(/[_\s-]+/g, ""),
      });
    });

    return allNodes;
  }

  /**
   * Slot 바인딩 찾기 (패턴 A, B, C 순차 적용)
   */
  private _findSlotBindings(
    slotCandidateProps: SlotCandidateProp[],
    allNodes: NodeInfo[]
  ): Map<string, SlotBinding> {
    const slotBindings = new Map<string, SlotBinding>();

    // 패턴 A: visible condition 바인딩
    this._findBindingsByVisibleCondition(
      slotCandidateProps,
      allNodes,
      slotBindings
    );

    // 패턴 B: 노드 이름 매칭 바인딩
    this._findBindingsByNameMatching(
      slotCandidateProps,
      allNodes,
      slotBindings
    );

    // 패턴 C: 위치 기반 매칭
    this._findBindingsByPosition(slotCandidateProps, allNodes, slotBindings);

    return slotBindings;
  }

  /**
   * 패턴 A: visible condition 바인딩 확인 (OR 조건 없는 단일 prop 매칭만)
   */
  private _findBindingsByVisibleCondition(
    slotCandidateProps: SlotCandidateProp[],
    allNodes: NodeInfo[],
    slotBindings: Map<string, SlotBinding>
  ) {
    for (const { node } of allNodes) {
      if (node.visible.type === "condition") {
        const conditionCode = generate(node.visible.condition);

        // OR 조건이 있으면 제외 (복합 조건은 slot이 아님)
        if (conditionCode.includes("||")) {
          continue;
        }

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
  }

  /**
   * 패턴 B: 노드 이름 매칭 바인딩 확인 (아직 바인딩 안된 것만)
   */
  private _findBindingsByNameMatching(
    slotCandidateProps: SlotCandidateProp[],
    allNodes: NodeInfo[],
    slotBindings: Map<string, SlotBinding>
  ) {
    for (const { node, normalizedName } of allNodes) {
      if (node.visible.type === "static") {
        for (const { key: propName } of slotCandidateProps) {
          if (slotBindings.has(propName)) continue;

          // 노드 이름이 prop 이름을 포함 (예: "lefticon" includes "lefticon")
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
  }

  /**
   * 패턴 C: 위치 기반 매칭 (여러 동일 이름 노드와 left/right prop 매칭)
   */
  private _findBindingsByPosition(
    slotCandidateProps: SlotCandidateProp[],
    allNodes: NodeInfo[],
    slotBindings: Map<string, SlotBinding>
  ) {
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

    if (!leftProp && !rightProp) return;

    // 아직 바인딩되지 않은 노드 중 공통 키워드(icon 등)를 가진 것들 찾기
    const boundNodeIds = new Set(
      [...slotBindings.values()].map((b) => b.node.id)
    );

    // 공통 키워드 추출 (예: iconLeft, iconRight에서 "icon" 추출)
    const keyword = this._extractCommonKeyword([leftProp?.key, rightProp?.key]);

    if (!keyword) return;

    const matchingUnboundNodes = allNodes
      .filter(
        ({ node, normalizedName }) =>
          !boundNodeIds.has(node.id) && normalizedName.includes(keyword)
      )
      .sort((a, b) => a.x - b.x); // x 좌표로 정렬 (왼쪽 → 오른쪽)

    if (matchingUnboundNodes.length >= 2) {
      // 노드가 2개 이상: 첫 번째와 마지막 노드를 left/right에 매칭
      if (leftProp) {
        const leftNode = matchingUnboundNodes[0];
        slotBindings.set(leftProp.key, {
          propName: leftProp.key,
          node: leftNode.node,
          bindingType: "positional_left",
        });
      }

      if (rightProp) {
        const rightNode = matchingUnboundNodes[matchingUnboundNodes.length - 1];
        slotBindings.set(rightProp.key, {
          propName: rightProp.key,
          node: rightNode.node,
          bindingType: "positional_right",
        });
      }
    } else if (matchingUnboundNodes.length === 1) {
      // 노드가 1개: leftProp 우선, 없으면 rightProp 사용
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
    // matchingUnboundNodes.length === 0인 경우는 아무것도 하지 않음 (이미 바인딩됨)
  }

  /**
   * Slot으로 확정된 props 변환 및 노드 마킹
   */
  private _convertPropsToSlots(
    astTree: FinalAstTree,
    slotBindings: Map<string, SlotBinding>
  ) {
    const slotPropNames = new Set<string>();

    for (const [propName, binding] of slotBindings) {
      const propDef = astTree.props[propName] as any;
      if (!propDef) continue;

      slotPropNames.add(propName);

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

      // 부모 노드의 visible condition에서 slot prop 관련 조건 제거
      if (node.parent && node.parent.visible.type === "condition") {
        node.parent.visible = this._removeSlotPropsFromCondition(
          node.parent.visible.condition,
          slotPropNames
        );
      }
    }
  }

  /**
   * Condition에서 slot prop 관련 조건 제거
   * 모든 조건이 제거되면 static: true 반환
   */
  private _removeSlotPropsFromCondition(
    condition: ConditionNode,
    slotPropNames: Set<string>
  ): VisibleValue {
    const cleaned = this._removePropsFromConditionNode(
      condition,
      slotPropNames
    );

    if (!cleaned) {
      // 모든 조건이 제거된 경우
      return { type: "static", value: true };
    }

    return { type: "condition", condition: cleaned };
  }

  /**
   * ConditionNode에서 특정 prop 참조를 재귀적으로 제거
   */
  private _removePropsFromConditionNode(
    node: any,
    slotPropNames: Set<string>
  ): ConditionNode | null {
    if (!node || !node.type) return null;

    if (node.type === "BinaryExpression") {
      const operator = node.operator;

      // props.X === "value" 형태인 경우, X가 slot prop이면 null 반환 (제거)
      if (operator === "===") {
        const left = node.left;
        if (
          left?.type === "MemberExpression" &&
          left.object?.name === "props" &&
          left.property?.name
        ) {
          const propName = left.property.name;
          // 원본 이름, camelCase 변환된 이름, 소문자 변환 모두 확인
          const camelPropName = toCamelCase(propName);
          const lowerPropName = propName.toLowerCase();

          // slotPropNames의 각 항목과 비교 (대소문자 무시)
          for (const slotProp of slotPropNames) {
            if (
              slotProp === propName ||
              slotProp === camelPropName ||
              slotProp.toLowerCase() === lowerPropName ||
              toCamelCase(slotProp) === camelPropName
            ) {
              return null; // 제거
            }
          }
        }
      }

      // && 또는 || 연산자의 경우 좌우 재귀 처리
      if (operator === "&&" || operator === "||") {
        const left = this._removePropsFromConditionNode(
          node.left,
          slotPropNames
        );
        const right = this._removePropsFromConditionNode(
          node.right,
          slotPropNames
        );

        // 둘 다 null이면 전체 제거
        if (!left && !right) return null;

        // 한쪽만 null이면 다른 쪽만 반환
        if (!left) return right!;
        if (!right) return left;

        // 둘 다 있으면 연산자 유지
        return {
          ...node,
          left,
          right,
        } as ConditionNode;
      }

      // 다른 연산자는 그대로 유지
      return node as ConditionNode;
    }

    // 다른 타입의 노드는 그대로 유지
    return node as ConditionNode;
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
