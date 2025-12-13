import { AbsoluteBoundingBox, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import helper from "../manager/HelperManager";

type Rect = { x1: number; y1: number; x2: number; y2: number };

class NodeMatcher {
  private specDataManager: SpecDataManager;
  constructor(specDataManager: SpecDataManager) {
    this.specDataManager = specDataManager;
  }

  /**
   * 같은 타입이여야하고
   * 오토레이아웃이라면 구조적 동질성 및 레이아웃 규칙을 판단
   * IoU (Intersection over Union)으로 80% 이상 겹치는지 판단
   * -> text node는 constraints값이 같아야 하고
   * -> constraints.horizontal === 'CENTER' 이라면 중앙점의 좌표를 비교
   *
   * @param node1
   * @param node2
   */
  public isSameNode(node1: SuperTreeNode, node2: SuperTreeNode) {
    if (node1.type !== node2.type) return false;
    if (node1.id === node2.id) {
      console.warn("Something Wrong! Same node id: ", node1.id, node2.id);
    }

    const node1Data = this.specDataManager.getSpecById(node1.id);
    const node2Data = this.specDataManager.getSpecById(node2.id);

    /**
     * 오토레이아웃이라면 구조적 동질성 및 레이아웃 규칙을 판단
     */
    if (node1Data.type === "FRAME" && node2Data.type === "FRAME") {
      if (!this.isAutoLayoutStructurallyEqual(node1Data, node2Data)) {
        return false;
      }
    }

    /**
     * IOU 검사
     * ! 두개의 프레임 같은지 어떻게 비교할것인가?
     */
    if (
      node1Data.type !== "TEXT" &&
      node2Data.type !== "TEXT" &&
      node1.parent &&
      node2.parent
    ) {
      const iou = this.getIou(node1, node2);

      if (iou !== null && iou < 0.8) {
        return false;
      }
    }

    /**
     * 1. 부모가 같고 이름이 같은지?
     * 2. 텍스트 영역이 겹치는지? (디자인 시안상 절대로 텍스트는 겹치지 않음)
     * 3. componentPropertyReferences, boundVariables이 같은걸 가리키고 있는지?
     */
    if (node1Data.type === "TEXT" && node2Data.type === "TEXT") {
      const iou = this.getIou(node1, node2);

      if (iou !== null && iou < 0.1) {
        return false;
      }
    }

    return true;
  }

  private isAutoLayoutStructurallyEqual(
    node1Data: FrameNode,
    node2Data: FrameNode
  ): boolean {
    // 둘 다 오토레이아웃이 아니면 통과
    const isNode1AutoLayout =
      node1Data.layoutMode && node1Data.layoutMode !== "NONE";
    const isNode2AutoLayout =
      node2Data.layoutMode && node2Data.layoutMode !== "NONE";

    // 오토레이아웃 여부가 다르면 false
    if (isNode1AutoLayout !== isNode2AutoLayout) return false;

    // 둘 다 오토레이아웃이 아니면 true
    if (!isNode1AutoLayout && !isNode2AutoLayout) return true;

    return this._compareByStructure(node1Data, node2Data);
  }

  private _compareByStructure(nodeA: FrameNode, nodeB: FrameNode): boolean {
    // 2. 자식 패턴 체크 (fingerprint)

    const patternA = this._getChildPattern(nodeA);
    const patternB = this._getChildPattern(nodeB);

    return patternA === patternB || patternA.length === patternB.length;
  }

  private _getChildPattern(node: FrameNode): string {
    const types = node.children.map((child) => child.type);

    if (types.length === 0) return "";

    // 주기적 패턴 찾기
    for (let patternLen = 1; patternLen <= types.length / 2; patternLen++) {
      if (types.length % patternLen !== 0) continue;

      const pattern = types.slice(0, patternLen);
      let isRepeating = true;

      for (let i = patternLen; i < types.length; i += patternLen) {
        const chunk = types.slice(i, i + patternLen);
        if (chunk.join("-") !== pattern.join("-")) {
          isRepeating = false;
          break;
        }
      }

      if (isRepeating) {
        return `(${pattern.join("-")})+`;
      }
    }

    // 주기적 패턴이 없으면 그대로 반환
    return types.join("-");
  }

  /**
   * IoU (Intersection over Union) 계산
   * @returns 0 ~ 1 사이의 값 (1 = 완전히 동일)
   */
  private _calculateIoU(
    box1: AbsoluteBoundingBox,
    box2: AbsoluteBoundingBox
  ): number {
    // 교집합 영역 계산
    const xOverlap = Math.max(
      0,
      Math.min(box1.x + box1.width, box2.x + box2.width) -
        Math.max(box1.x, box2.x)
    );
    const yOverlap = Math.max(
      0,
      Math.min(box1.y + box1.height, box2.y + box2.height) -
        Math.max(box1.y, box2.y)
    );

    const intersectionArea = xOverlap * yOverlap;

    // 합집합 영역 계산
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;

    // 면적이 0인 경우: 좌표와 크기가 같으면 1, 아니면 0
    if (area1 === 0 || area2 === 0) {
      return box1.x === box2.x &&
        box1.y === box2.y &&
        box1.width === box2.width &&
        box1.height === box2.height
        ? 1
        : 0;
    }

    const unionArea = area1 + area2 - intersectionArea;

    if (unionArea === 0) return 0;

    return intersectionArea / unionArea;
  }

  /**
   * 부모 기준 상대 좌표로 변환
   */
  public getRelativeBoundingBox(
    nodeBox: AbsoluteBoundingBox,
    parentBox: AbsoluteBoundingBox
  ): AbsoluteBoundingBox {
    return {
      x: nodeBox.x - parentBox.x,
      y: nodeBox.y - parentBox.y,
      width: nodeBox.width,
      height: nodeBox.height,
    };
  }

  /**
   * 같은 부모에서 겹치는 비율 확인
   * @param node1
   * @param node2
   */
  public getIou(node1: SuperTreeNode, node2: SuperTreeNode) {
    if (!node1.parent || !node2.parent) return null;

    const parent1Data = this.specDataManager.getSpecById(node1.parent.id);
    const parent2Data = this.specDataManager.getSpecById(node2.parent.id);

    const node1Data = this.specDataManager.getSpecById(node1.id);
    const node2Data = this.specDataManager.getSpecById(node2.id);

    // 부모 타입이 같고, 크기가 같은지 확인
    if (
      parent1Data?.absoluteBoundingBox &&
      parent2Data?.absoluteBoundingBox &&
      parent1Data.type === parent2Data.type &&
      parent1Data.absoluteBoundingBox.width ===
        parent2Data.absoluteBoundingBox.width &&
      parent1Data.absoluteBoundingBox.height ===
        parent2Data.absoluteBoundingBox.height
    ) {
      const nodeBox1 = node1Data.absoluteBoundingBox;
      const nodeBox2 = node2Data.absoluteBoundingBox;

      if (nodeBox1 && nodeBox2) {
        // 부모 기준 상대 좌표로 변환
        const relativeBox1 = this.getRelativeBoundingBox(
          nodeBox1,
          parent1Data.absoluteBoundingBox
        );
        const relativeBox2 = this.getRelativeBoundingBox(
          nodeBox2,
          parent2Data.absoluteBoundingBox
        );

        // IoU 계산
        const iou = this._calculateIoU(relativeBox1, relativeBox2);
        return iou;
      }
    }

    return null;
  }

  /**
   * Root Component 기준으로 겹치는지 비율 확인
   * @param node1
   * @param node2
   */
  public getIou2(node1: SuperTreeNode, node2: SuperTreeNode) {
    if (!node1.parent || !node2.parent) return null;

    const node1Data = this.specDataManager.getSpecById(node1.id);
    const node2Data = this.specDataManager.getSpecById(node2.id);

    const parent1Data = this.specDataManager.getSpecById(
      helper.getRootComponentNode(node1).id
    );
    const parent2Data = this.specDataManager.getSpecById(
      helper.getRootComponentNode(node2).id
    );

    /**
     * 부모 두개를 노멀라이즈.
     * - 부모가 매우 다를경우 (오토레이아웃 다름, 타입 다름) 이면 null 반환
     */

    if (parent1Data.type !== parent2Data.type) return null;
    if (parent1Data.type === "FRAME" && parent2Data.type === "FRAME") {
      if (parent1Data.layoutMode !== parent2Data.layoutMode) return null;
    }

    const node1BoundingBox = node1Data.absoluteBoundingBox;
    const parent1BoundingBox = parent1Data.absoluteBoundingBox;

    const node2BoundingBox = node2Data.absoluteBoundingBox;
    const parent2BoundingBox = parent2Data.absoluteBoundingBox;

    if (
      !node1BoundingBox ||
      !parent1BoundingBox ||
      !node2BoundingBox ||
      !parent2BoundingBox
    )
      return null;

    const node1Rect: Rect = {
      x1:
        (node1BoundingBox.x - parent1BoundingBox.x) / parent1BoundingBox.width,
      y1:
        (node1BoundingBox.y - parent1BoundingBox.y) / parent1BoundingBox.height,
      x2:
        (node1BoundingBox.x + node1BoundingBox.width - parent1BoundingBox.x) /
        parent1BoundingBox.width,
      y2:
        (node1BoundingBox.y + node1BoundingBox.height - parent1BoundingBox.y) /
        parent1BoundingBox.height,
    };

    const node2Rect: Rect = {
      x1:
        (node2BoundingBox.x - parent2BoundingBox.x) / parent2BoundingBox.width,
      y1:
        (node2BoundingBox.y - parent2BoundingBox.y) / parent2BoundingBox.height,
      x2:
        (node2BoundingBox.x + node2BoundingBox.width - parent2BoundingBox.x) /
        parent2BoundingBox.width,
      y2:
        (node2BoundingBox.y + node2BoundingBox.height - parent2BoundingBox.y) /
        parent2BoundingBox.height,
    };

    const iou = this._iou(node1Rect, node2Rect);

    return iou;
  }

  private _iou(a: Rect, b: Rect) {
    const ix1 = Math.max(a.x1, b.x1);
    const iy1 = Math.max(a.y1, b.y1);
    const ix2 = Math.min(a.x2, b.x2);
    const iy2 = Math.min(a.y2, b.y2);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    const inter = iw * ih;

    const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
    const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
    const uni = areaA + areaB - inter;
    return uni <= 0 ? 0 : inter / uni;
  }

  private getBoundingBoxFromRootComponent(node: SceneNode) {
    if (!node.parent)
      return {
        x: 0,
        y: 0,
      };

    const rootBoundingBox = helper.getRootComponentNode(node);

    if (
      !rootBoundingBox ||
      !node.absoluteBoundingBox ||
      !rootBoundingBox.absoluteBoundingBox
    )
      return null;

    return {
      x: Math.abs(
        rootBoundingBox.absoluteBoundingBox.x - node.absoluteBoundingBox.x
      ),
      y: Math.abs(
        rootBoundingBox.absoluteBoundingBox.y - node.absoluteBoundingBox.y
      ),
    };
  }
}

export default NodeMatcher;
