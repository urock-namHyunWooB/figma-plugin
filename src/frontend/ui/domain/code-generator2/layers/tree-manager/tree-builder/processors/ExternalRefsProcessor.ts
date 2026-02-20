import { InternalNode } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * ExternalRefsProcessor
 *
 * INSTANCE 노드 → refId 설정
 *
 * 외부 컴포넌트 참조:
 * 1. INSTANCE 타입 노드 찾기
 * 2. componentId 추출
 * 3. refId로 설정
 */
export class ExternalRefsProcessor {
  private readonly dataManager: DataManager;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * 외부 참조 해결 (재귀)
   */
  public resolveExternalRefs(node: InternalNode): InternalNode {
    // INSTANCE 노드면 refId 설정
    const refId = this.extractRefId(node);

    // children 재귀 처리
    const children = node.children.map((child) =>
      this.resolveExternalRefs(child)
    );

    return {
      ...node,
      ...(refId ? { refId } : {}),
      children,
    };
  }

  /**
   * INSTANCE 노드의 componentId 추출
   */
  private extractRefId(node: InternalNode): string | undefined {
    // INSTANCE 타입이 아니면 무시
    if (node.type !== "INSTANCE") {
      return undefined;
    }

    // mergedNodes가 없으면 무시
    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return undefined;
    }

    // 첫 번째 mergedNode의 id로 원본 SceneNode 가져오기
    const firstMergedId = node.mergedNodes[0].id;
    const { node: sceneNode } = this.dataManager.getById(firstMergedId);

    if (!sceneNode) {
      return undefined;
    }

    // componentId 추출
    const componentId = (sceneNode as any).componentId as string | undefined;

    return componentId;
  }
}
