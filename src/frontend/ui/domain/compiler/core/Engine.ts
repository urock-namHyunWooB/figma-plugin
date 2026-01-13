import FigmaCompiler, { RenderTree } from "@compiler";
import NodeMatcher from "@compiler/core/NodeMatcher";
import debug from "@compiler/manager/DebuggingManager";
import RefineProps from "@compiler/core/RefineProps";
import CreateAstTree from "@compiler/core/ast-tree/CreateAstTree";
import ReactGenerator, {
  ReactGeneratorOptions,
} from "@compiler/core/react-generator/ReactGenerator";
import CreateSuperTree from "./super-tree/CreateSuperTree";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { toCamelCase } from "@compiler/utils/normalizeString";
import ArraySlotDetector, { ArraySlot } from "@compiler/core/ArraySlotDetector";
import type { StyleStrategyOptions } from "@compiler/core/react-generator/style-strategy";

/**
 * Engine 옵션
 */
export interface EngineOptions {
  /** 스타일 전략 옵션 */
  styleStrategy?: StyleStrategyOptions;
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
    const node = root.SpecDataManager.getSpecById(renderTree.id);
    const specManager = root.SpecDataManager;
    const matcher = new NodeMatcher(specManager);

    // 배열 슬롯 감지
    const arraySlotDetector = new ArraySlotDetector(
      root.SpecDataManager.getSpec()
    );
    this.arraySlots = arraySlotDetector.detect();

    this.CreateSuperTree = new CreateSuperTree(
      renderTree,
      specManager,
      matcher
    );

    const refinedProps = new RefineProps(renderTree, specManager).refinedProps;

    const superNodeTree = this.CreateSuperTree.getSuperTree();

    const createFinalAstTree = (this.CreateFinalAstTree = new CreateAstTree(
      specManager,
      superNodeTree,
      refinedProps
    ));

    // ReactGenerator 옵션 구성
    const generatorOptions: ReactGeneratorOptions = {
      styleStrategy: options?.styleStrategy,
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
