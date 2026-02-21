import { InternalNode } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * ExternalRefsProcessor
 *
 * 외부 참조 처리:
 * 1. INSTANCE 노드 → refId 설정
 * 2. 의존 컴포넌트 Vector SVG 주입 (DataManager 정규화 데이터 사용)
 */
export class ExternalRefsProcessor {
  private readonly dataManager: DataManager;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * 외부 참조 해결 (재귀)
   */
  public resolveExternalRefs(node: InternalNode, isRoot: boolean = true): InternalNode {
    // INSTANCE 노드면 refId 설정
    const refId = this.extractRefId(node);

    // children 재귀 처리 (children은 root가 아님)
    let children = node.children.map((child) =>
      this.resolveExternalRefs(child, false)
    );

    // 루트 노드이고 children이 비어있으면 merged Vector SVG 확인
    if (isRoot && children.length === 0) {
      const vectorChild = this.createMergedVectorChild(node.id);
      if (vectorChild) {
        children = [vectorChild];
      }
    }

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

  /**
   * 의존 컴포넌트의 병합된 Vector SVG를 InternalNode로 생성
   * DataManager가 정규화한 데이터 사용
   */
  private createMergedVectorChild(componentId: string): InternalNode | null {
    // DataManager에서 정규화된 병합 SVG 가져오기
    const mergedSvg = this.dataManager.getMergedVectorSvgForComponent(componentId);
    if (!mergedSvg) {
      return null;
    }

    // Vector InternalNode 생성 (SVG를 metadata에 직접 저장)
    return {
      id: `${componentId}_vector`,
      name: "Merged Vector",
      type: "VECTOR",
      parent: null,
      children: [],
      metadata: {
        vectorSvg: mergedSvg,  // 직접 전달
      },
    };
  }
}
