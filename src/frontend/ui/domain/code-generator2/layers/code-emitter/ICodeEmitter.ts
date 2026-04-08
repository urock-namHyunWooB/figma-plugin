/**
 * ICodeEmitter
 *
 * 코드 생성기 공통 인터페이스
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    Framework Implementations                    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │   ICodeEmitter                                                  │
 * │        │                                                        │
 * │        ├─► ReactEmitter    (Emotion / Tailwind)                 │
 * │        │                                                        │
 * │        ├─► VueEmitter      (future)                             │
 * │        │                                                        │
 * │        └─► SvelteEmitter   (future)                             │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { VariantInconsistency } from "../../types/types";
import type { SemanticComponent } from "./SemanticIR";

/** 코드 생성 결과 (단일 컴포넌트) */
export interface EmittedCode {
  /** 생성된 코드 */
  code: string;
  /** 컴포넌트 이름 */
  componentName: string;
  /** 파일 확장자 */
  fileExtension: string;
  /** variant 불일치 진단 (있으면 디자인 점검 필요) */
  diagnostics?: VariantInconsistency[];
}

/** 번들 코드 + 진단 결과 */
export interface BundledResult {
  code: string;
  diagnostics: VariantInconsistency[];
}

/** 코드 생성 결과 (메인 + 의존 컴포넌트) */
export interface GeneratedResult {
  /** 메인 컴포넌트 코드 */
  main: EmittedCode;
  /** 의존 컴포넌트 코드 (componentId → code) */
  dependencies: Map<string, EmittedCode>;
}

/** 코드 생성기 인터페이스 */
export interface ICodeEmitter {
  /** 프레임워크 이름 */
  readonly framework: string;

  /**
   * 단일 SemanticComponent → 코드 변환
   */
  emit(ir: SemanticComponent): Promise<EmittedCode>;

  /**
   * 메인 + 의존 IR → 개별 코드 변환 (멀티 파일 출력용)
   */
  emitAll(
    main: SemanticComponent,
    deps: Map<string, SemanticComponent>
  ): Promise<GeneratedResult>;

  /**
   * 메인 + 의존 IR → 단일 파일 번들 출력
   */
  emitBundled(
    main: SemanticComponent,
    deps: Map<string, SemanticComponent>
  ): Promise<BundledResult>;
}
