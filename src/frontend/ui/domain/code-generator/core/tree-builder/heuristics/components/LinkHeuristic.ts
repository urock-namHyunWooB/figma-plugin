/**
 * LinkHeuristic
 *
 * 링크/앵커 컴포넌트 휴리스틱.
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: link, text-link, anchor, hyperlink
 *
 * 현재는 GenericHeuristic과 동일한 동작.
 * 기본 stateMapping에 :visited 이미 포함.
 */

import type { BuildContext } from "../../workers/BuildContext";
import { GenericHeuristic } from "./GenericHeuristic";

const LINK_NAME_PATTERNS: RegExp[] = [
  /^link$/i,
  /text.?link/i,
  /anchor/i,
  /hyperlink/i,
];

export class LinkHeuristic extends GenericHeuristic {
  readonly componentType = "link" as const;
  readonly name = "LinkHeuristic";

  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;
    return LINK_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  // Link는 :visited pseudo-class 활용
  // 기본 stateMapping에 이미 포함됨

  // 향후 Link 특수 처리
  // - href 속성 추출
  // - external link 아이콘 처리
}
