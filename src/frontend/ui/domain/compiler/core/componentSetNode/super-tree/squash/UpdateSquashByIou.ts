import { RenderTree, SuperTreeNode } from "@compiler";
import { DirectedGraph, UnionFind } from "@compiler/manager/HelperManager";
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
  IOU_THRESHOLD = 0.5;

  private matcher: NodeMatcher;
  private specDataManager: SpecDataManager;

  constructor(matcher: NodeMatcher, specDataManager: SpecDataManager) {
    this.matcher = matcher;
    this.specDataManager = specDataManager;
  }

  public updateSquashByIou(superTree: SuperTreeNode, components: RenderTree[]) {
    const { nodesByType } = this.groupNodesByType(superTree);
    const squashGroups = this.findSquashGroups(nodesByType);

    const filteredSquashGroups = [];

    for (const group of squashGroups) {
      const a = this.specDataManager.getSpecById(group[0].id);
      const b = this.specDataManager.getSpecById(group[1].id);

      if (("isMask" in a && a.isMask) || ("isMask" in b && b.isMask)) {
        continue;
      }

      /**
       * Id가 I로 시작하면 해당 노드는 Instance 자식요소임
       * 같은 인스턴스 자식요소 일때만 스쿼시 가능
       */
      if (a.id[0] === "I" || b.id[0] === "I") {
        if (a.id[0] !== b.id[0]) {
          continue;
        }
      }

      /**
       * 부모 요소중 mask가 있는지?
       * Component node까지 부모 거슬러 올라가서 isMask가 있는지?
       */
      let isValid = true;
      let parentA = group[0].parent;
      let parentB = group[1].parent;

      while (parentA || parentB) {
        // isMask 체크 먼저 (COMPONENT의 isMask도 확인하기 위해)
        if (
          parentA &&
          "isMask" in parentA.metaData.spec &&
          parentA.metaData.spec.isMask
        ) {
          isValid = false;
          break;
        }

        if (
          parentB &&
          "isMask" in parentB.metaData.spec &&
          parentB.metaData.spec.isMask
        ) {
          isValid = false;
          break;
        }

        if (parentA && parentA.type === "COMPONENT") {
          parentA = null;
        }
        if (parentB && parentB.type === "COMPONENT") {
          parentB = null;
        }

        parentA = parentA?.parent ?? null;
        parentB = parentB?.parent ?? null;
      }

      if (isValid === false) continue;

      filteredSquashGroups.push(group);
    }

    console.log(filteredSquashGroups);

    return superTree;
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
          if (iou !== null && iou >= this.IOU_THRESHOLD) {
            squashTarget.push([nodes[i], nodes[j]]);
          }
        }
      }
    }

    return squashTarget;
  }
}

export default UpdateSquashByIou;
