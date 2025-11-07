/**
 * Variant 변경 관리 클래스
 * 단일 책임: Component Instance의 Variant 속성 변경
 */
export class VariantManager {
  /**
   * Instance 노드의 Variant 속성 변경
   */
  async changeVariant(
    nodeId: string,
    propertyName: string,
    value: string
  ): Promise<boolean> {
    const node = (await figma.getNodeByIdAsync(nodeId)) as InstanceNode;

    if (!node || node.type !== "INSTANCE") {
      return false;
    }

    try {
      node.setProperties({
        [propertyName]: value,
      });
      return true;
    } catch (error) {
      console.error("Variant change failed:", error);
      return false;
    }
  }
}
