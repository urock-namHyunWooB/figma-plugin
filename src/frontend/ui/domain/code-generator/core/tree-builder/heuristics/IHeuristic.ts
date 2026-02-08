/**
 * IHeuristic Interface
 *
 * TreeBuilder에서 사용되는 휴리스틱 인터페이스 정의.
 * 각 휴리스틱은 COMPONENT_SET 분석 시 특정 패턴을 감지하고 BuildContext에 결과를 추가합니다.
 *
 * 휴리스틱은 variant 비교가 필요하므로 COMPONENT_SET에서만 작동합니다.
 */

import type { BuildContext } from "../workers/interfaces";

// PlaceholderInfo는 architecture.ts에서 정의되고 재사용됩니다.
export type { PlaceholderInfo } from "@code-generator/types/architecture";

/**
 * 휴리스틱 인터페이스
 *
 * 각 휴리스틱은 독립적인 파일로 구현되며,
 * HeuristicsRunner에 등록되어 실행됩니다.
 */
export interface IHeuristic {
  /** 휴리스틱 이름 (디버깅용) */
  name: string;

  /** 휴리스틱 실행 */
  run(ctx: BuildContext): BuildContext;
}
