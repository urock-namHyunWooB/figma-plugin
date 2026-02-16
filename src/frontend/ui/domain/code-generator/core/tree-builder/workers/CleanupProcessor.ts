/**
 * Cleanup Processor
 *
 * 불필요한 노드를 정리하는 Processor
 *
 * 포함된 기능:
 * - INSTANCE 내부 노드 제거 (I...로 시작하는 ID)
 * - 높이 0인 노드 제거
 */

import type { BuildContext, InternalNode } from "./interfaces";
import { isInstanceChildId } from "./utils/instanceUtils";

/**
 * CleanupProcessor 클래스
 *
 * 불필요한 노드를 정리하여 최종 트리를 깔끔하게 유지
 */
export class CleanupProcessor {
  /**
   * SVG로 렌더링되어야 하는 노드 타입
   */
  private static readonly SVG_RENDERABLE_TYPES = new Set([
    "VECTOR",
    "LINE",
    "ELLIPSE",
    "STAR",
    "POLYGON",
    "BOOLEAN_OPERATION",
  ]);

  /**
   * INSTANCE 내부의 중복 노드 제거
   *
   * INSTANCE로 외부 컴포넌트를 참조할 때, 그 내부 children은
   * 외부 컴포넌트에서 렌더링되므로 현재 트리에서 제거해야 합니다.
   * I...;...;... 형태의 compound ID를 가진 노드들을 제거합니다.
   *
   * 예외 처리:
   * - VECTOR/BOOLEAN_OPERATION 등 SVG 노드는 vectorSvgs 데이터가 있으면 유지
   * - 루트가 INSTANCE인 경우 children 유지 (그 자체가 콘텐츠)
   * - enrichedFromEmptyChildren 플래그가 true인 경우 유지
   *
   * @returns INSTANCE 내부 노드가 정리된 BuildContext
   */
  static removeInstanceInternalNodes(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      return ctx;
    }

    // 데이터에서 enrichedFromEmptyChildren 플래그 확인
    // 원래 children이 비어있고 INSTANCE children으로 채워진 경우는 유지
    // ctx.data는 PreparedDesignData이고, 원본 spec은 ctx.data.spec에 있음
    const spec = (ctx.data as any)?.spec;
    const enrichedFromEmptyChildren =
      spec?._enrichedFromEmptyChildren === true;

    if (enrichedFromEmptyChildren) {
      // INSTANCE children이 실제 콘텐츠인 경우 제거하지 않음
      return ctx;
    }

    // 루트 노드가 INSTANCE인 경우도 I... 노드 유지
    // (루트 자체가 INSTANCE이면 그 children이 실제 콘텐츠)
    const rootType = ctx.data.document.type;
    if (rootType === "INSTANCE") {
      return ctx;
    }

    const cleanedTree = CleanupProcessor.cleanNode(ctx.internalTree, ctx);

    return { ...ctx, internalTree: cleanedTree };
  }

  /**
   * 노드와 그 children을 정리
   */
  private static cleanNode(node: InternalNode, ctx: BuildContext): InternalNode {
    const cleanedChildren: InternalNode[] = [];

    for (const child of node.children) {
      // INSTANCE 내부 노드 ID인지 확인
      if (isInstanceChildId(child.id)) {
        // SVG 렌더링 노드는 vectorSvgs 데이터가 있으면 유지
        if (CleanupProcessor.SVG_RENDERABLE_TYPES.has(child.type)) {
          const hasVectorSvg = ctx.data.vectorSvgs?.get(child.id);
          if (hasVectorSvg) {
            const cleanedChild = CleanupProcessor.cleanNode(child, ctx);
            cleanedChildren.push(cleanedChild);
            continue;
          }
        }
        // INSTANCE 내부 노드는 건너뛰기
        continue;
      }

      // 재귀적으로 자식 정리
      const cleanedChild = CleanupProcessor.cleanNode(child, ctx);
      cleanedChildren.push(cleanedChild);
    }

    return {
      ...node,
      children: cleanedChildren,
    };
  }

  /**
   * 높이 0인 노드 제거
   */
  static removeZeroHeightNodes(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      return ctx;
    }

    const cleanedTree = CleanupProcessor.removeZeroHeight(ctx.internalTree, ctx);

    return { ...ctx, internalTree: cleanedTree };
  }

  /**
   * 높이 0인 노드 필터링
   */
  private static removeZeroHeight(
    node: InternalNode,
    ctx: BuildContext
  ): InternalNode {
    const spec = ctx.data.getNodeById(node.id);
    const height = spec?.absoluteBoundingBox?.height;

    // 루트 노드는 항상 유지
    const isRoot = !node.parent;

    const cleanedChildren: InternalNode[] = [];

    for (const child of node.children) {
      const childSpec = ctx.data.getNodeById(child.id);
      const childHeight = childSpec?.absoluteBoundingBox?.height;

      // 높이가 0이 아니거나 TEXT 타입이면 유지
      if (childHeight !== 0 || child.type === "TEXT") {
        const cleanedChild = CleanupProcessor.removeZeroHeight(child, ctx);
        cleanedChildren.push(cleanedChild);
      }
    }

    return {
      ...node,
      children: cleanedChildren,
    };
  }
}

export default CleanupProcessor;
