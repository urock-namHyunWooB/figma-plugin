import { UITree, FigmaNodeData } from "../../../types/types";
import DataManager from "../../data-manager/DataManager";

/**
 * 개별 컴포넌트의 UITree를 빌드하는 역할
 * 복잡한 변환 파이프라인 담당
 */
class TreeBuilder {
  private readonly dataManager: DataManager;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * FigmaNodeData → UITree 변환
   */
  public build(spec: FigmaNodeData): UITree {
    // TODO: 파이프라인 구현
    throw new Error("Not implemented");
  }
}

export default TreeBuilder;
