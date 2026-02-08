/**
 * Heuristics Module
 *
 * TreeBuilder에서 사용되는 휴리스틱 시스템.
 * COMPONENT_SET 분석 시 특정 UX 패턴을 감지합니다.
 *
 * 각 휴리스틱이 canProcess()로 자신이 처리할 컴포넌트인지 판별하고,
 * process()로 세부 패턴을 감지합니다.
 */

export { HeuristicsRunner } from "./HeuristicsRunner";
export type { IHeuristic, PlaceholderInfo } from "./IHeuristic";
export type { IComponentHeuristic } from "./components/IComponentHeuristic";
export { InputHeuristic } from "./components/InputHeuristic";
