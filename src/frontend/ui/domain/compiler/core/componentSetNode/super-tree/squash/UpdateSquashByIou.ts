import { RenderTree, SuperTreeNode } from "@compiler";
import { traverseBFS } from "@compiler/utils/traverse";
import NodeMatcher from "../../../NodeMatcher";
import SpecDataManager from "@compiler/manager/SpecDataManager";
/**
 * TODO 타입만 같다고 해서 스쿼시 하면 안된다.
 * z-index가 동일하거나, 스쿼시해도 순서를 100% 보존할 수 있을 것
 *
 * componentKey(or componentId) + variantProps(있다면) + type 뿐 아니라
 * 스타일 해시(fill/stroke/effect/opacity/blend/clip 등 핵심 렌더 속성)까지 완전 동일
 *
 * 겹침 판정은 단순 교집합이 아니라 IoU(Intersection over Union) 같은 비율 기준으로
 * 예: IoU >= 0.95 처럼 “거의 동일 위치/크기”일 때만 (수치는 프로젝트에 맞게)
 *
 * Text는 별도 취급(폰트/라인하이트/정렬/오토리사이즈/베이스라인 때문에 합치면 잘 깨짐)
 *
 * 마스크/클립/블렌드가 조금이라도 끼면 스쿼시 금지
 */

class UpdateSquashByIou {
  private static readonly INSTANCE_ID_PREFIX = "I";
  private static readonly IOU_THRESHOLD = 0.5;

  private matcher: NodeMatcher;
  private specDataManager: SpecDataManager;

  constructor(matcher: NodeMatcher, specDataManager: SpecDataManager) {
    this.matcher = matcher;
    this.specDataManager = specDataManager;
  }

  public updateSquashByIou(
    superTree: SuperTreeNode,
    _components: RenderTree[]
  ) {
    const { nodesByType } = this.groupNodesByType(superTree);
    const squashGroups = this.findSquashGroups(nodesByType);

    const filteredSquashGroups = squashGroups.filter((group) =>
      this.isValidSquashGroup(group)
    );

    console.log(filteredSquashGroups);
    return superTree;
  }

  /** 스쿼시 그룹이 유효한지 검증 */
  private isValidSquashGroup(group: SuperTreeNode[]): boolean {
    const [nodeA, nodeB] = group;
    const specA = this.specDataManager.getSpecById(nodeA.id);
    const specB = this.specDataManager.getSpecById(nodeB.id);

    if (this.isMaskedSpec(specA) || this.isMaskedSpec(specB)) {
      return false;
    }

    if (!this.isInstanceChildren(specA, specB)) {
      return false;
    }

    if (this.hasParentWithMask(nodeA) || this.hasParentWithMask(nodeB)) {
      return false;
    }

    if (this.isAncestorDescendant(nodeA, nodeB)) {
      return false;
    }

    return true;
  }

  /** spec이 마스크인지 확인 */
  private isMaskedSpec(spec: unknown): boolean {
    return (
      typeof spec === "object" &&
      spec !== null &&
      "isMask" in spec &&
      (spec as { isMask?: boolean }).isMask === true
    );
  }

  /**
   * 인스턴스의 자식요소인지?
   * 한쪽만 인스턴스 자식요소 이면 스쿼시 할 수 없음.
   * */
  private isInstanceChildren(
    specA: { id: string },
    specB: { id: string }
  ): boolean {
    const isInstanceA = specA.id.startsWith(
      UpdateSquashByIou.INSTANCE_ID_PREFIX
    );
    const isInstanceB = specB.id.startsWith(
      UpdateSquashByIou.INSTANCE_ID_PREFIX
    );

    // 둘 다 인스턴스가 아니면 OK
    if (!isInstanceA && !isInstanceB) return true;

    // 둘 다 인스턴스여야 OK
    return isInstanceA && isInstanceB;
  }

  /**
   * 조상-자식 관계인지 확인
   * @param nodeA
   * @param nodeB
   */
  private isAncestorDescendant(nodeA: SuperTreeNode, nodeB: SuperTreeNode) {
    // nodeA가 nodeB의 조상인지 확인
    let current: SuperTreeNode | null = nodeB.parent;
    while (current) {
      if (current.id === nodeA.id) {
        return true;
      }
      current = current.parent;
    }

    // nodeB가 nodeA의 조상인지 확인
    current = nodeA.parent;
    while (current) {
      if (current.id === nodeB.id) {
        return true;
      }
      current = current.parent;
    }

    return false;
  }

  /** 부모 체인에 마스크가 있는지 확인 (COMPONENT 노드까지) */
  private hasParentWithMask(node: SuperTreeNode): boolean {
    let parent = node.parent;

    while (parent) {
      if (this.isMaskedSpec(parent.metaData.spec)) {
        return true;
      }

      if (parent.type === "COMPONENT") {
        break;
      }

      parent = parent.parent ?? null;
    }

    return false;
  }

  /** 타입별로 노드 그룹핑 */
  private groupNodesByType(superTree: SuperTreeNode) {
    const nodesByType = new Map<string, SuperTreeNode[]>();

    traverseBFS(superTree, (node) => {
      if (!nodesByType.has(node.type)) {
        nodesByType.set(node.type, []);
      }
      nodesByType.get(node.type)!.push(node);
    });

    return { nodesByType };
  }

  /** IOU 기반으로 스쿼시 대상 그룹 찾기 */
  private findSquashGroups(nodesByType: Map<string, SuperTreeNode[]>) {
    const squashTarget: SuperTreeNode[][] = [];

    // 같은 타입 내에서 IOU가 높은 노드들을 union
    for (const [_, nodes] of nodesByType) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const iou = this.matcher.getIou2(nodes[i], nodes[j]);
          if (iou !== null && iou >= UpdateSquashByIou.IOU_THRESHOLD) {
            squashTarget.push([nodes[i], nodes[j]]);
          }
        }
      }
    }

    return squashTarget;
  }
}

export default UpdateSquashByIou;
