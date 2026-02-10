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

export class LinkHeuristic extends GenericHeuristic {
  readonly componentType = "link" as const;
  readonly name = "LinkHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  /**
   * Link 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - link (독립): +10
   * - text-link: +12
   * - anchor: +10
   * - hyperlink: +10
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;

    if (/^link$/i.test(name)) score += 10;
    if (/text.?link/i.test(name)) score += 12;
    if (/anchor/i.test(name)) score += 10;
    if (/hyperlink/i.test(name)) score += 10;

    return score;
  }

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= LinkHeuristic.MATCH_THRESHOLD;
  }

  // Link는 :visited pseudo-class 활용
  // 기본 stateMapping에 이미 포함됨

  // 향후 Link 특수 처리
  // - href 속성 추출
  // - external link 아이콘 처리
}
