import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import { FigmaNodeData } from "./types/types";
import TreeManager from "@frontend/ui/domain/code-generator2/layers/tree-manager/TreeManager";

/** 프레임워크별 스타일 전략 타입 */
type ReactStyleStrategy = "emotion" | "tailwind";

/** 프레임워크별 옵션 (Discriminated Union) */
type FrameworkOptions =
  | { framework: "REACT"; styleStrategy: ReactStyleStrategy };

/**
 * FigmaCodeGenerator 옵션
 */
export type FigmaCodeGeneratorOptions = FrameworkOptions & {
  /** 디버그 모드: true이면 data-figma-id 속성 추가 */
  debug?: boolean;
};

/**
 * FigmaCodeGenerator
 *
 * Figma 디자인 데이터를 React 컴포넌트 코드로 변환합니다.
 *
 * 파이프라인: FigmaNodeData → DataPreparer → TreeManager → ReactEmitter → 코드
 */
export class FigmaCodeGenerator {
  private readonly dataManager: DataManager;

  private readonly treeManager: TreeManager;

  /**
   * FigmaCodeGenerator 생성자
   * @param spec - Figma에서 추출한 노드 데이터
   * @param options - 코드 생성 옵션 (스타일 전략, 디버그 모드 등)
   */
  constructor(spec: FigmaNodeData, options?: FigmaCodeGeneratorOptions) {
    const dataManager = (this.dataManager = new DataManager(spec));

    /**
     * 트리 빌더 레이어 - JSON을 트리로 변환하는 레이어
     *
     * 의존 컴포넌트 관련 트리로 구축
     * 의존성 관리
     * treeBuilder 안에 json을 tree 형태로 렌더링 하는 렌더링 엔진이 있음.
     * 휴리스틱 엔진도 있음
     */
    const treeManager = (this.treeManager = new TreeManager(spec));

    /**
     * 코드 에미터 - 트리를 최종 code로 변환하는 레이어
     *
     *
     */
  }
}

export default FigmaCodeGenerator;
