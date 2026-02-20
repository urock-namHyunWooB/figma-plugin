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
import DataManager from "./layers/data-manager/DataManager";
import TreeManager from "./layers/tree-manager/TreeManager";
import type { ICodeEmitter, EmittedCode } from "./layers/code-emitter/ICodeEmitter";
import { ReactEmitter, type StyleStrategyType } from "./layers/code-emitter/react/ReactEmitter";

/** 코드 생성 옵션 */
export interface GeneratorOptions {
  /** 스타일 전략: emotion (기본) 또는 tailwind */
  styleStrategy?: StyleStrategyType;
  /** 디버그 모드: data-figma-id 속성 추가 */
  debug?: boolean;
}

/** 코드 생성 결과 */
export interface GeneratedResult {
  /** 메인 컴포넌트 코드 */
  main: EmittedCode;
  /** 의존 컴포넌트 코드 (componentId → code) */
  dependencies: Map<string, EmittedCode>;
}

export class FigmaCodeGenerator {
  private readonly dataManager: DataManager;
  private readonly treeManager: TreeManager;
  private readonly codeEmitter: ICodeEmitter;

  constructor(spec: FigmaNodeData, options: GeneratorOptions = {}) {
    // Layer 1: 데이터 접근
    this.dataManager = new DataManager(spec);

    // Layer 2: 트리 구축
    this.treeManager = new TreeManager(this.dataManager);

    // Layer 3: 코드 생성 (현재 React만 지원, 추후 Vue/Svelte 확장 가능)
    this.codeEmitter = new ReactEmitter({
      styleStrategy: options.styleStrategy ?? "emotion",
      debug: options.debug ?? false,
    });
  }

  /**
   * 전체 파이프라인 실행: FigmaNodeData → React Code
   */
  async generate(): Promise<GeneratedResult> {
    // Step 1: UITree 구축
    const { main: mainTree, dependencies: depTrees } = this.treeManager.build();

    // Step 2: 코드 생성
    const mainCode = await this.codeEmitter.emit(mainTree);

    const depCodes = new Map<string, EmittedCode>();
    for (const [depId, depTree] of depTrees) {
      depCodes.set(depId, await this.codeEmitter.emit(depTree));
    }

    return {
      main: mainCode,
      dependencies: depCodes,
    };
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
}

export default FigmaCodeGenerator;
