import type { PropIR } from "../../types/props";

/**
 * PropIR[]를 정리하고 최적화
 * 
 * 현재는 pass-through이지만, 나중에 다음 작업을 수행할 수 있음:
 * - 중복 제거
 * - 정렬
 * - 유효성 검증
 * - 최적화
 */
export function prettifyPropsIR(props: PropIR[]): PropIR[] {
  // TODO: 향후 정리 로직 추가 가능
  // 예: 중복 제거, 정렬, 유효성 검증 등
  
  return props;
}

