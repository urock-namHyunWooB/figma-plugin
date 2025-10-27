/**
 * 메타데이터 관리 클래스
 * 단일 책임: 노드의 플러그인 데이터 읽기/쓰기
 */
export class MetadataManager {
  private readonly METADATA_KEY = "metadata-type";

  /**
   * 노드에 메타데이터 설정
   */
  async setMetadata(nodeId: string, metadataType: string): Promise<boolean> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      return false;
    }

    node.setPluginData(this.METADATA_KEY, metadataType);
    return true;
  }

  /**
   * 노드의 메타데이터 읽기
   */
  getMetadata(node: SceneNode): string | null {
    return node.getPluginData(this.METADATA_KEY) || null;
  }
}
