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

import type { UITree } from "../../types/types";

/** 코드 생성 결과 */
export interface EmittedCode {
  /** 생성된 코드 */
  code: string;
  /** 컴포넌트 이름 */
  componentName: string;
  /** 파일 확장자 */
  fileExtension: string;
}

/** 코드 생성기 인터페이스 */
export interface ICodeEmitter {
  /** 프레임워크 이름 */
  readonly framework: string;

  /**
   * UITree → 코드 변환
   */
  emit(uiTree: UITree): Promise<EmittedCode>;
}
