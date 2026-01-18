import FigmaCompiler, { RenderTree } from "@compiler";
import NodeMatcher from "@compiler/core/NodeMatcher";
import CreateAstTree from "@compiler/core/ast-tree/CreateAstTree";
import ReactGenerator, {
  ReactGeneratorOptions,
} from "@compiler/core/react-generator/ReactGenerator";
import CreateSuperTree from "./super-tree/CreateSuperTree";

import ArraySlotDetector, { ArraySlot } from "@compiler/core/ArraySlotDetector";
import type { StyleStrategyOptions } from "@compiler/core/react-generator/style-strategy";

/**
 * Engine 옵션
 */
export interface EngineOptions {
  /** 스타일 전략 옵션 */
  styleStrategy?: StyleStrategyOptions;
  /** 디버그 모드: true이면 data-figma-id 속성 추가 */
  debug?: boolean;
}

class Engine {
  private CreateSuperTree: CreateSuperTree;
  private CreateFinalAstTree: CreateAstTree;
  private reactGenerator: ReactGenerator;
  private arraySlots: ArraySlot[];

  constructor(
    root: FigmaCompiler,
    renderTree: RenderTree,
    options?: EngineOptions
  ) {
    const specManager = root.SpecDataManager;
    const matcher = new NodeMatcher(specManager);

    // 배열 슬롯 감지
    this.arraySlots = new ArraySlotDetector(
      root.SpecDataManager.getSpec()
    ).detect();

    this.CreateSuperTree = new CreateSuperTree(
      renderTree,
      specManager,
      matcher
    );

    const refinedProps = root.propsManager.extractedProps;

    const superNodeTree = this.CreateSuperTree.getSuperTree();

    const createFinalAstTree = (this.CreateFinalAstTree = new CreateAstTree(
      specManager,
      superNodeTree,
      refinedProps
    ));

    // ReactGenerator 옵션 구성
    const generatorOptions: ReactGeneratorOptions = {
      styleStrategy: options?.styleStrategy,
      debug: options?.debug,
    };

    this.reactGenerator = new ReactGenerator(
      createFinalAstTree.finalAstTree,
      this.arraySlots,
      generatorOptions
    );
  }

  /**
   * 생성된 React 컴포넌트 코드를 반환
   * @param componentName 컴포넌트 이름 (기본값: "Button")
   * @returns 생성된 TypeScript/TSX 코드 문자열
   */
  public async getGeneratedCode(
    componentName: string = "Button"
  ): Promise<string> {
    return await this.reactGenerator.generateComponentCode(componentName);
  }

  /**
   * FinalAstTree 반환 (props 정보 추출용)
   */
  public getFinalAstTree() {
    return this.CreateFinalAstTree.finalAstTree;
  }

  /**
   * TempAstTree 반환 (디버깅용)
   */
  public getTempAstTree() {
    return this.CreateFinalAstTree.tempAstTree;
  }
}

export default Engine;
