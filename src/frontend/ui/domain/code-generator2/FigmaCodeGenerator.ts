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
  BundledResult,
} from "./layers/code-emitter/ICodeEmitter";
import type { VariantInconsistency } from "./types/types";
import { ReactEmitter, renameNativeProps } from "./layers/code-emitter/react/ReactEmitter";
import { SemanticIRBuilder } from "./layers/code-emitter/SemanticIRBuilder";
import type { SemanticComponent } from "./layers/code-emitter/SemanticIR";
import { toComponentName } from "./utils/nameUtils";
import { toPublicProps } from "./adapters/PropsAdapter";
import type { FeedbackGroup } from "./feedback/types";
import { FeedbackBuilder } from "./feedback/FeedbackBuilder";
import type { NamingOptions } from "./types/public";

export type { GeneratedResult, BundledResult } from "./layers/code-emitter/ICodeEmitter";
export type { VariantInconsistency } from "./types/types";
export type { FeedbackGroup, FeedbackItem } from "./feedback/types";

/** compile() 반환 타입: 코드 + 진단 */
export interface CompileResult {
  code: string | null;
  diagnostics: VariantInconsistency[];
  /** 그룹핑된 variant style 피드백 (UI 소비용) */
  feedbackGroups: FeedbackGroup[];
}

export type {
  SlotInfo,
  PropDefinition,
  CompiledDependency,
  MultiComponentResult,
  TailwindOptions,
  GeneratorOptions,
  DeclarationStyle,
  ExportStyle,
  NamingOptions,
  StyleNamingStrategy,
} from "./types/public";

class FigmaCodeGenerator {
  private readonly dataManager: DataManager;
  private readonly treeManager: TreeManager;
  private readonly codeEmitter: ICodeEmitter;
  private readonly namingOptions?: NamingOptions;

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
    const shadcnOptions = styleStrategyObj?.shadcn;

    this.namingOptions = options.naming;

    this.codeEmitter = new ReactEmitter({
      styleStrategy,
      debug: options.debug ?? false,
      tailwind: tailwindOptions,
      shadcn: shadcnOptions,
      declarationStyle: options.declarationStyle,
      exportStyle: options.exportStyle,
      naming: options.naming,
      dependencyMode: options.dependencyMode,
      importBasePath: options.importBasePath,
    });
  }

  private get conflictPrefix(): string {
    return this.namingOptions?.conflictPropPrefix ?? "custom";
  }

  /**
   * 전체 파이프라인 실행: FigmaNodeData → React Code (멀티 파일)
   */
  async generate(): Promise<GeneratedResult> {
    const { main, dependencies } = this.treeManager.build();
    const prefix = this.conflictPrefix;
    const mainIR = SemanticIRBuilder.build(renameNativeProps(main, prefix));
    const depIRs = new Map<string, SemanticComponent>();
    for (const [id, dep] of dependencies) {
      depIRs.set(id, SemanticIRBuilder.build(renameNativeProps(dep, prefix)));
    }
    return this.codeEmitter.emitAll(mainIR, depIRs);
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
    const ir = SemanticIRBuilder.build(renameNativeProps(uiTree, this.conflictPrefix));
    return this.codeEmitter.emit(ir);
  }

  /**
   * 코드 생성 (단일 파일 번들)
   */
  async compile(): Promise<string | null> {
    const result = await this.compileWithDiagnostics();
    return result.code;
  }

  /**
   * 코드 생성 + variant 불일치 진단 (단일 파일 번들)
   */
  async compileWithDiagnostics(): Promise<CompileResult> {
    try {
      const diagnostics: VariantInconsistency[] = [];
      const { main, dependencies } = this.treeManager.build(diagnostics);
      const prefix = this.conflictPrefix;
      const mainIR = SemanticIRBuilder.build(renameNativeProps(main, prefix));
      const depIRs = new Map<string, SemanticComponent>();
      for (const [id, dep] of dependencies) {
        depIRs.set(id, SemanticIRBuilder.build(renameNativeProps(dep, prefix)));
      }
      const result = await this.codeEmitter.emitBundled(mainIR, depIRs);

      const componentSetName = main.root.name ?? "Component";
      const feedbackGroups = FeedbackBuilder.build(diagnostics, componentSetName);

      return { code: result.code, diagnostics, feedbackGroups };
    } catch (e) {
      console.error("Compile error:", e);
      return { code: null, diagnostics: [], feedbackGroups: [] };
    }
  }

  /**
   * Props 정의 반환 (UI 컨트롤러용)
   */
  getPropsDefinition(): PropDefinition[] {
    const uiTree = this.buildUITree().main;
    return toPublicProps(uiTree.props, this.dataManager, uiTree.arraySlots);
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
