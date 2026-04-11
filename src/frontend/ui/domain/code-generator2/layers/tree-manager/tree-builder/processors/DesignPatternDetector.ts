import type { InternalTree } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

/**
 * DesignPatternDetector
 *
 * InternalTree를 순회하며 디자이너가 사용한 시각 기법(디자인 패턴)을 감지하고
 * 해당 노드의 metadata.designPatterns에 annotation을 부착한다.
 *
 * 감지만 수행하며, 처리(transform)는 후속 processor가 annotation을 읽어 수행한다.
 */
export class DesignPatternDetector {
  constructor(private readonly dataManager: DataManager) {}

  detect(tree: InternalTree): void {
    // 패턴별 감지 메서드는 이후 Task에서 추가
  }
}
