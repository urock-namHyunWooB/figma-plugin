/**
 * FigmaCodeGenerator
 *
 * Figma 디자인 데이터를 React 컴포넌트 코드로 변환하는 메인 엔트리포인트
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      High-Level Pipeline                        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │   FigmaNodeData                                                 │
 * │        │                                                        │
 * │        ▼                                                        │
 * │   ┌─────────────┐                                               │
 * │   │ DataManager │  데이터 접근 레이어 (HashMap 기반 O(1) 조회)    │
 * │   └──────┬──────┘                                               │
 * │          │                                                      │
 * │          ▼                                                      │
 * │   ┌─────────────┐                                               │
 * │   │ TreeManager │  트리 구축 레이어                              │
 * │   │  └ TreeBuilder (6단계 파이프라인 + 휴리스틱)                 │
 * │   └──────┬──────┘                                               │
 * │          │ UITree                                               │
 * │          ▼                                                      │
 * │   ┌─────────────┐                                               │
 * │   │ CodeEmitter │  코드 생성 레이어                              │
 * │   │  └ StyleStrategy (Emotion / Tailwind)                      │
 * │   └──────┬──────┘                                               │
 * │          │                                                      │
 * │          ▼                                                      │
 * │   React Component Code (.tsx)                                   │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { FigmaNodeData, UITree } from "./types/types";
import type {
  PropDefinition,
  CompiledDependency,
  MultiComponentResult,
  GeneratorOptions,
} from "./types/public";
import DataManager from "./layers/data-manager/DataManager";
import TreeManager from "./layers/tree-manager/TreeManager";
import type {
  ICodeEmitter,
  EmittedCode,
  GeneratedResult,
} from "./layers/code-emitter/ICodeEmitter";
import { ReactEmitter } from "./layers/code-emitter/react/ReactEmitter";
import { toComponentName } from "./utils/nameUtils";
import { toPublicProps } from "./adapters/PropsAdapter";

export type { GeneratedResult } from "./layers/code-emitter/ICodeEmitter";
export type {
  SlotInfo,
  PropDefinition,
  CompiledDependency,
  MultiComponentResult,
  TailwindOptions,
  GeneratorOptions,
} from "./types/public";

class FigmaCodeGenerator {
  private readonly dataManager: DataManager;
  private readonly treeManager: TreeManager;
  private readonly codeEmitter: ICodeEmitter;

  constructor(spec: FigmaNodeData, options: GeneratorOptions = {}) {
    // Layer 1: 데이터 접근
    this.dataManager = new DataManager(spec);

    // Layer 2: 트리 구축
    this.treeManager = new TreeManager(this.dataManager);

    // Layer 3: 코드 생성 (현재 React만 지원, 추후 Vue/Svelte 확장 가능)
    // v1 호환: styleStrategy가 객체일 수 있음
    const styleStrategyObj =
      typeof options.styleStrategy === "object"
        ? options.styleStrategy
        : undefined;
    const styleStrategy =
      styleStrategyObj?.type ??
      (typeof options.styleStrategy === "string"
        ? options.styleStrategy
        : "emotion");
    const tailwindOptions = styleStrategyObj?.tailwind;

    this.codeEmitter = new ReactEmitter({
      styleStrategy,
      debug: options.debug ?? false,
      tailwind: tailwindOptions,
    });
  }

  /**
   * 전체 파이프라인 실행: FigmaNodeData → React Code (멀티 파일)
   */
  async generate(): Promise<GeneratedResult> {
    const { main, dependencies } = this.treeManager.build();
    return this.codeEmitter.emitAll(main, dependencies);
  }

  /**
   * UITree만 반환 (디버깅/테스트용)
   */
  buildUITree(): { main: UITree; dependencies: Map<string, UITree> } {
    return this.treeManager.build();
  }

  /**
   * 단일 UITree → 코드 변환 (디버깅/테스트용)
   */
  async emitCode(uiTree: UITree): Promise<EmittedCode> {
    return this.codeEmitter.emit(uiTree);
  }

  /**
   * 코드 생성 (단일 파일 번들)
   */
  async compile(): Promise<string | null> {
    try {
      const { main, dependencies } = this.treeManager.build();
      return await this.codeEmitter.emitBundled(main, dependencies);
    } catch (e) {
      console.error("Compile error:", e);
      return null;
    }
  }


  /**
   * Props 정의 반환 (UI 컨트롤러용)
   */
  getPropsDefinition(): PropDefinition[] {
    const uiTree = this.buildUITree().main;
    return toPublicProps(uiTree.props, this.dataManager);
  }

  /**
   * 컴포넌트 이름 반환
   */
  getComponentName(): string {
    const mainId = this.dataManager.getMainComponentId();
    const { node } = this.dataManager.getById(mainId);
    return toComponentName(node?.name ?? "Component");
  }

  /**
   * 멀티 컴포넌트 컴파일 결과 반환
   */
  async getGeneratedCodeWithDependencies(): Promise<MultiComponentResult> {
    const result = await this.generate();

    const dependencies: CompiledDependency[] = [];
    for (const [id, emitted] of result.dependencies) {
      dependencies.push({
        id,
        name: emitted.componentName,
        code: emitted.code,
      });
    }

    return {
      mainCode: result.main.code,
      mainName: result.main.componentName,
      dependencies,
    };
  }
}

export default FigmaCodeGenerator;
