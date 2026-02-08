/**
 * Component Heuristics
 *
 * 컴포넌트 유형별 휴리스틱 모듈.
 * ComponentTypeDetector가 판별한 유형에 따라 해당 휴리스틱이 실행됩니다.
 */

export type { IComponentHeuristic } from "./IComponentHeuristic";
export { InputHeuristic } from "./InputHeuristic";

// 향후 확장:
// export { ButtonHeuristic } from "./ButtonHeuristic";
// export { ModalHeuristic } from "./ModalHeuristic";
// export { CheckboxHeuristic } from "./CheckboxHeuristic";
