/**
 * ModuleHeuristic
 *
 * 모듈 레벨 컴포넌트를 감지하고 모듈 전용 프로세서 파이프라인을 실행한다.
 *
 * 모듈 vs 컴포넌트 구분:
 *   - 작은 컴포넌트 (Button, Avatar, Badge 등): size는 prop으로 유지
 *   - 모듈 (Card, Section, GNB 등): breakpoint/size가 responsive @media로 변환 가능
 *
 * 프로세서 파이프라인:
 *   1. ResponsiveProcessor — breakpoint variant → CSS @media query
 *   (향후 추가 프로세서 확장 가능)
 *
 * 현재 상태:
 *   - Phase 1: 명시적 breakpoint prop (이름 기반) → ResponsiveProcessor 실행 (구현 완료)
 *   - Phase 2: 모듈 판별 기반 size→responsive 변환 → 스켈레톤 (기준 확정 후 구현)
 */

import type { InternalTree, PropDefinition } from "../../../../../types/types";
import { ResponsiveProcessor } from "./ResponsiveProcessor";

export class ModuleHeuristic {
  /**
   * 모듈 레벨 컴포넌트를 감지하고 프로세서 파이프라인 실행
   * @param tree - InternalTree (in-place 수정)
   * @param props - PropDefinition 배열 (in-place 수정)
   */
  static run(tree: InternalTree, props: PropDefinition[]): void {
    // Phase 1: 명시적 breakpoint prop 감지 (DesignPatternDetector annotation 기반)
    const bpPattern = tree.metadata?.designPatterns?.find(
      (p) => p.type === "breakpointVariant"
    );
    if (bpPattern) {
      const bpIdx = props.findIndex((p) => p.name === bpPattern.prop);
      if (bpIdx !== -1) {
        ResponsiveProcessor.run(tree, props, bpIdx);
        return;
      }
    }

    // Phase 2: 모듈 판별 (TODO — 기준 확정 후 구현)
    // if (isModule(tree, props)) {
    //   // size variant → responsive 변환 등
    // }
  }
}
