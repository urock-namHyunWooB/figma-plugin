import { AbsoluteBoundingBox, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import debug from "@compiler/manager/DebuggingManager";

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
    debug.debugger([node1.id, "716:526"]);
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
      const parent1Data = this.specDataManager.getSpecById(node1.parent.id);
      const parent2Data = this.specDataManager.getSpecById(node2.parent.id);

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
          if (iou < 0.8) return false;
        }
      }
    }

    /**
     * //TODO 두개의 텍스트가 같은 역할군인지 비교하는 로직
     */
    if (node1Data.type === "TEXT" && node2Data.type === "TEXT") {

      // 1. constraints가 같아야 함

      if (
        !this._isSameConstraints(node1Data.constraints, node2Data.constraints)
      ) {
        return false;
      }

      // 2. 텍스트 정렬에 따른 위치 비교 (부모 기준 상대 좌표로)
      if (node1.parent && node2.parent) {
        const parent1Data = this.specDataManager.getSpecById(node1.parent.id);
        const parent2Data = this.specDataManager.getSpecById(node2.parent.id);

        const nodeBox1 = node1Data.absoluteBoundingBox;
        const nodeBox2 = node2Data.absoluteBoundingBox;

        if (
          nodeBox1 &&
          nodeBox2 &&
          parent1Data?.absoluteBoundingBox &&
          parent2Data?.absoluteBoundingBox
        ) {
          const relativeBox1 = this.getRelativeBoundingBox(
            nodeBox1,
            parent1Data.absoluteBoundingBox
          );
          const relativeBox2 = this.getRelativeBoundingBox(
            nodeBox2,
            parent2Data.absoluteBoundingBox
          );

          // constraints 기반으로 텍스트 위치 비교
          const isMatch = this._isTextPositionMatch(
            relativeBox1,
            relativeBox2,
            node1Data.constraints?.horizontal,
            node2Data.constraints?.horizontal,
            node1Data.constraints?.vertical,
            node2Data.constraints?.vertical
          );

          if (!isMatch) return false;
        }
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

  private _isSameConstraints(
    c1?: { horizontal?: string; vertical?: string },
    c2?: { horizontal?: string; vertical?: string }
  ): boolean {
    if (!c1 && !c2) return true;
    if (!c1 || !c2) return false;

    return c1.horizontal === c2.horizontal && c1.vertical === c2.vertical;
  }

  private getCenterPoint(box: AbsoluteBoundingBox): { x: number; y: number } {
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  }

  private _isNearCenter(
    box1: AbsoluteBoundingBox,
    box2: AbsoluteBoundingBox,
    tolerance: number = 5 // 허용 오차 (픽셀)
  ): boolean {
    const center1 = this.getCenterPoint(box1);
    const center2 = this.getCenterPoint(box2);

    return Math.abs(center1.x - center2.x) <= tolerance;
  }

  /**
   * constraints에 따른 기준점 좌표 계산
   */
  private _getTextAnchorPoint(
    box: AbsoluteBoundingBox,
    hConstraint?: "LEFT" | "CENTER" | "RIGHT" | string,
    vConstraint?: "TOP" | "CENTER" | "BOTTOM" | string
  ): { x: number; y: number } {
    let x: number;
    let y: number;

    // 가로 constraints에 따른 X 기준점
    switch (hConstraint) {
      case "CENTER":
        x = box.x + box.width / 2;
        break;
      case "RIGHT":
        x = box.x + box.width;
        break;
      case "LEFT":
      default:
        x = box.x;
        break;
    }

    // 세로 constraints에 따른 Y 기준점
    switch (vConstraint) {
      case "CENTER":
        y = box.y + box.height / 2;
        break;
      case "BOTTOM":
        y = box.y + box.height;
        break;
      case "TOP":
      default:
        y = box.y;
        break;
    }

    return { x, y };
  }

  /**
   * 텍스트 노드의 기준점이 같은 위치인지 비교 (constraints 기반)
   */
  private _isTextPositionMatch(
    box1: AbsoluteBoundingBox,
    box2: AbsoluteBoundingBox,
    hConstraint1?: string,
    hConstraint2?: string,
    vConstraint1?: string,
    vConstraint2?: string,
    tolerance: number = 30
  ): boolean {
    // constraints가 다르면 비교 불가 → false
    if (hConstraint1 !== hConstraint2 || vConstraint1 !== vConstraint2) {
      return false;
    }

    const anchor1 = this._getTextAnchorPoint(box1, hConstraint1, vConstraint1);
    const anchor2 = this._getTextAnchorPoint(box2, hConstraint2, vConstraint2);

    return (
      Math.abs(anchor1.x - anchor2.x) <= tolerance &&
      Math.abs(anchor1.y - anchor2.y) <= tolerance
    );
  }

  /**
   * 부모 기준 상대 좌표로 변환
   */
  private getRelativeBoundingBox(
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
}

export default NodeMatcher;
