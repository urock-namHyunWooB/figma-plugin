/**
 * Type Guards
 *
 * 공통 타입 가드 유틸리티
 */

/**
 * SceneNode에 children이 있는지 확인
 */
export function hasChildren(
  node: SceneNode
): node is SceneNode & { children: readonly SceneNode[] } {
  return "children" in node && Array.isArray((node as { children?: unknown }).children);
}

/**
 * INSTANCE 노드인지 확인
 */
export function isInstanceNode(node: SceneNode): node is InstanceNode {
  return node.type === "INSTANCE";
}

/**
 * INSTANCE 노드에서 componentId 추출
 * Figma 데이터에는 componentId가 있지만 타입 정의에는 포함되지 않음
 */
export function getComponentId(node: SceneNode | undefined): string | undefined {
  if (!node || !isInstanceNode(node)) return undefined;
  return (node as unknown as { componentId?: string }).componentId;
}
