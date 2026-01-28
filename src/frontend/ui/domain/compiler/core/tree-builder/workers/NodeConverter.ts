/**
 * NodeConverter
 *
 * InternalNode → DesignNode 변환
 *
 * 미리 계산된 Map들(nodeTypes, nodeStyles, nodePropBindings 등)을 사용하여
 * 최종 DesignNode 트리를 조립합니다.
 */

import type { BuildContext } from "./interfaces";
import type { DesignNode } from "@compiler/types/architecture";
import { mapTree } from "./utils/treeUtils";

// ============================================================================
// NodeConverter Class
// ============================================================================

export class NodeConverter {
  /**
   * 이미 계산된 Map들을 사용해서 최종 DesignNode 트리를 조립
   *
   * 필요한 ctx 필드:
   * - nodeTypes, nodeStyles, nodePropBindings, nodeExternalRefs, semanticRoles
   */
  static assemble(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("NodeConverter.assemble: internalTree is required.");
    }
    if (!ctx.nodeTypes) {
      throw new Error("NodeConverter.assemble: nodeTypes is required.");
    }
    if (!ctx.nodeStyles) {
      throw new Error("NodeConverter.assemble: nodeStyles is required.");
    }

    const root = mapTree<DesignNode>(ctx.internalTree, (internal, children) => {
      // 미리 계산된 값들 조회
      const nodeType = ctx.nodeTypes!.get(internal.id) ?? "container";
      const styles = ctx.nodeStyles!.get(internal.id) ?? { base: {}, dynamic: [] };
      const propBindings = ctx.nodePropBindings?.get(internal.id);
      const externalRefData = ctx.nodeExternalRefs?.get(internal.id);
      const semanticResult = ctx.semanticRoles?.get(internal.id);

      // 외부 참조 변환
      const externalRef = externalRefData
        ? {
            componentSetId: externalRefData.componentSetId,
            componentName: externalRefData.componentName,
            props: externalRefData.props,
          }
        : undefined;

      return {
        id: internal.id,
        type: nodeType,
        name: internal.name,
        styles,
        children,
        propBindings: propBindings && Object.keys(propBindings).length > 0 ? propBindings : undefined,
        externalRef,
        semanticRole: semanticResult?.role,
        vectorSvg: semanticResult?.vectorSvg,
      };
    });

    return { ...ctx, root };
  }
}

export default NodeConverter;
