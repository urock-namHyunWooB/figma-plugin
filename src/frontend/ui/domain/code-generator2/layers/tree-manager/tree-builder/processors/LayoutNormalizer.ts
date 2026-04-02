import DataManager from "../../../data-manager/DataManager";

export interface NormalizedPosition {
  relCenterX: number;
  relCenterY: number;
  relWidth: number;
  relHeight: number;
}

interface ContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class LayoutNormalizer {
  private readonly dataManager: DataManager;
  private contentBoxCache = new Map<string, ContentBox | null>();

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * reference의 content box 기준으로 target의 상대 위치 반환.
   * content box가 유효하지 않으면 null.
   */
  normalize(reference: any, target: any): NormalizedPosition | null {
    const refBounds = reference.absoluteBoundingBox;
    const tgtBounds = target.absoluteBoundingBox;
    if (!refBounds || !tgtBounds) return null;

    const box = this.calcContentBox(reference);
    if (!box || box.width <= 0 || box.height <= 0) return null;

    const targetCenterX = tgtBounds.x + tgtBounds.width / 2;
    const targetCenterY = tgtBounds.y + tgtBounds.height / 2;

    return {
      relCenterX: (targetCenterX - box.x) / box.width,
      relCenterY: (targetCenterY - box.y) / box.height,
      relWidth: tgtBounds.width / box.width,
      relHeight: tgtBounds.height / box.height,
    };
  }

  /**
   * 두 NormalizedPosition의 3-way 비교.
   * 0~1 범위의 cost 반환 (낮을수록 유사).
   */
  compare(a: NormalizedPosition, b: NormalizedPosition): number {
    // X축
    const leftA = a.relCenterX - a.relWidth / 2;
    const leftB = b.relCenterX - b.relWidth / 2;
    const centerDiffX = Math.abs(a.relCenterX - b.relCenterX);
    const rightA = 1 - a.relCenterX - a.relWidth / 2;
    const rightB = 1 - b.relCenterX - b.relWidth / 2;
    const minDiffX = Math.min(Math.abs(leftA - leftB), centerDiffX, Math.abs(rightA - rightB));

    // Y축
    const topA = a.relCenterY - a.relHeight / 2;
    const topB = b.relCenterY - b.relHeight / 2;
    const centerDiffY = Math.abs(a.relCenterY - b.relCenterY);
    const bottomA = 1 - a.relCenterY - a.relHeight / 2;
    const bottomB = 1 - b.relCenterY - b.relHeight / 2;
    const minDiffY = Math.min(Math.abs(topA - topB), centerDiffY, Math.abs(bottomA - bottomB));

    return Math.max(minDiffX, minDiffY);
  }

  /**
   * avgSize 기반 3-way 비교 (fallback).
   * reference 크기가 크게 다를 때 (예: variant root 높이 80 vs 460)
   * 독립 정규화는 발산하므로, 절대 offset 차이를 평균 크기로 나누어 비교한다.
   */
  compareAvgSize(refA: any, targetA: any, refB: any, targetB: any): number {
    const boxA = this.calcContentBox(refA);
    const boxB = this.calcContentBox(refB);
    if (!boxA || !boxB || boxA.width <= 0 || boxA.height <= 0 || boxB.width <= 0 || boxB.height <= 0) return Infinity;

    const bndsA = targetA.absoluteBoundingBox;
    const bndsB = targetB.absoluteBoundingBox;
    if (!bndsA || !bndsB) return Infinity;

    const avgW = (boxA.width + boxB.width) / 2;
    const avgH = (boxA.height + boxB.height) / 2;

    // X축: 절대 offset 기반 3-way
    const offAx = bndsA.x - boxA.x;
    const offBx = bndsB.x - boxB.x;
    const leftX = Math.abs(offAx - offBx) / avgW;
    const cenAx = offAx + bndsA.width / 2;
    const cenBx = offBx + bndsB.width / 2;
    const centerX = Math.abs(cenAx - cenBx) / avgW;
    const rightAx = boxA.width - offAx - bndsA.width;
    const rightBx = boxB.width - offBx - bndsB.width;
    const rightX = Math.abs(rightAx - rightBx) / avgW;
    const minDiffX = Math.min(leftX, centerX, rightX);

    // Y축: 절대 offset 기반 3-way
    const offAy = bndsA.y - boxA.y;
    const offBy = bndsB.y - boxB.y;
    const topY = Math.abs(offAy - offBy) / avgH;
    const midAy = offAy + bndsA.height / 2;
    const midBy = offBy + bndsB.height / 2;
    const middleY = Math.abs(midAy - midBy) / avgH;
    const botAy = boxA.height - offAy - bndsA.height;
    const botBy = boxB.height - offBy - bndsB.height;
    const bottomY = Math.abs(botAy - botBy) / avgH;
    const minDiffY = Math.min(topY, middleY, bottomY);

    return Math.max(minDiffX, minDiffY);
  }

  /**
   * 노드의 content box 계산 (padding, stroke 고려).
   */
  private calcContentBox(node: any): ContentBox | null {
    const id = node.id;
    if (id && this.contentBoxCache.has(id)) return this.contentBoxCache.get(id)!;

    const bounds = node.absoluteBoundingBox;
    if (!bounds) {
      if (id) this.contentBoxCache.set(id, null);
      return null;
    }

    const pl = node.paddingLeft ?? 0;
    const pr = node.paddingRight ?? 0;
    const pt = node.paddingTop ?? 0;
    const pb = node.paddingBottom ?? 0;

    let w = bounds.width - pl - pr;
    let h = bounds.height - pt - pb;

    const strokeOffset = (node.strokesIncludedInLayout && node.strokeWeight) ? node.strokeWeight : 0;
    if (strokeOffset) {
      w -= strokeOffset * 2;
      h -= strokeOffset * 2;
    }

    const box: ContentBox = {
      x: bounds.x + pl + strokeOffset,
      y: bounds.y + pt + strokeOffset,
      width: w,
      height: h,
    };

    if (id) this.contentBoxCache.set(id, box);
    return box;
  }
}
