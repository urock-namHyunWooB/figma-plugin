/**
 * NewEngine
 *
 * 새 파이프라인을 사용하는 Engine 구현
 *
 * 파이프라인: FigmaNodeData → DataPreparer → TreeBuilder → ReactEmitter → 코드
 *
 * 기존 Engine과 동일한 인터페이스를 제공하여 FigmaCodeGenerator에서 쉽게 전환 가능
 */

import type { FigmaNodeData } from "@code-generator/types/baseType";
import type {
  DesignTree,
  CodeEmitterPolicy,
  StyleStrategy,
} from "@code-generator/types/architecture";

import DataPreparer from "@code-generator/core/data-preparer/DataPreparer";
import TreeBuilder from "@code-generator/core/tree-builder/TreeBuilder";
import ReactEmitter from "@code-generator/core/code-emitter/ReactEmitter";

/**
 * NewEngine 의존성
 */
export interface NewEngineDependencies {
  /** Figma 원본 데이터 */
  spec: FigmaNodeData;
}

/**
 * NewEngine 옵션
 */
export interface NewEngineOptions {
  /** 스타일 전략 */
  styleStrategy?: "emotion" | "tailwind";
  /** Tailwind 옵션 */
  tailwindOptions?: {
    inlineCn?: boolean;
    cnImportPath?: string;
  };
  /** 디버그 모드: true이면 data-figma-id 속성 추가 */
  debug?: boolean;
}

class NewEngine {
  private designTree: DesignTree;
  private policy: CodeEmitterPolicy;
  private emitter: ReactEmitter;

  constructor(deps: NewEngineDependencies, options?: NewEngineOptions) {
    const { spec } = deps;

    // 1. DataPreparer: FigmaNodeData → PreparedDesignData
    const dataPreparer = new DataPreparer();
    const preparedData = dataPreparer.prepare(spec);

    // 2. TreeBuilder: PreparedDesignData → DesignTree
    const treeBuilder = new TreeBuilder();
    this.designTree = treeBuilder.build(preparedData);

    // 3. CodeEmitterPolicy 구성
    this.policy = this.createPolicy(options);

    // 4. ReactEmitter 인스턴스 생성
    //TODO 여기서는 ReactEmitter 라던지 그런걸 주입받아야 하지 않나?
    this.emitter = new ReactEmitter();
  }

  /**
   * 생성된 React 컴포넌트 코드를 반환
   * @param componentName 컴포넌트 이름 (기본값: DesignTree.root.name)
   * @returns 생성된 TypeScript/TSX 코드 문자열
   */
  public async getGeneratedCode(componentName?: string): Promise<string> {
    // 컴포넌트 이름이 지정된 경우 루트 노드 이름 변경
    if (componentName) {
      this.designTree.root.name = componentName;
    }

    const result = await this.emitter.emit(this.designTree, this.policy);
    return result.code;
  }

  /**
   * DesignTree 반환
   */
  public getDesignTree(): DesignTree {
    return this.designTree;
  }

  /**
   * 옵션에서 CodeEmitterPolicy 생성
   */
  private createPolicy(options?: NewEngineOptions): CodeEmitterPolicy {
    const styleStrategy: StyleStrategy = options?.styleStrategy || "emotion";

    return {
      platform: "react",
      styleStrategy,
      tailwindOptions: options?.tailwindOptions,
      debug: options?.debug,
    };
  }
}

export default NewEngine;
