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

    // v1 호환: INSTANCE 노드의 이름을 dependency의 ComponentSet 이름으로 변경
    // INSTANCE 이름 "Plus"가 아닌, dependency 이름 "Theme=Line" → "Themeline" 사용
    let name = node.name;
    if (refId) {
      const depName = this.resolveDependencyName(refId);
      if (depName) {
        name = depName;
      }
    }

    return {
      ...node,
      name,
      ...(refId ? { refId } : {}),
      children,
    };
  }

  /**
   * INSTANCE 노드의 componentId 추출
   * dependencies에 있는 INSTANCE만 외부 참조로 처리
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

    // dependencies에 없으면 외부 참조로 처리하지 않음 (v1 호환)
    if (!componentId || !this.dataManager.getAllDependencies().has(componentId)) {
      return undefined;
    }

    return componentId;
  }

  /**
   * v1 호환: dependency의 ComponentSet 이름 결정
   *
   * 우선순위 (v1 InstanceProcessor.buildExternalRef 참고):
   * 1. componentSets[componentSetId].name (ComponentSet 이름)
   * 2. document.name (dependency 문서 이름)
   * 3. null (원래 INSTANCE 이름 유지)
   */
  private resolveDependencyName(componentId: string): string | null {
    const depSpec = this.dataManager.getAllDependencies().get(componentId);
    if (!depSpec) return null;

    // ComponentSet 이름 우선
    const componentInfo = depSpec.info.components?.[componentId] as
      | { componentSetId?: string }
      | undefined;
    const componentSetId = componentInfo?.componentSetId;

    if (componentSetId) {
      const componentSetInfo = depSpec.info.componentSets?.[componentSetId] as
        | { name?: string }
        | undefined;
      if (componentSetInfo?.name) {
        return componentSetInfo.name;
      }
    }

    // ComponentSet 이름이 없으면 document.name
    return depSpec.info.document?.name || null;
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
