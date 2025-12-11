import { SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";

class _SortNodes {
  private specDataManager: SpecDataManager;

  constructor(specDataManager: SpecDataManager) {
    this.specDataManager = specDataManager;
  }
  /**
   * parentNode의 자식요소를 정렬
   */
  public sortChildrenNodes(parentNode: SuperTreeNode) {
    if (parentNode.children.length <= 0) return parentNode;
    const children = parentNode.children;
  }
}

export default _SortNodes;
