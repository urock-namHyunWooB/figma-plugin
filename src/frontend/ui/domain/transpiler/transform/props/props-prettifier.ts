import type { PropIR } from "../../types/props";
import type { NodeSpec } from "@backend";

/**
 * PropIR[]를 정리하고 최적화
 *
 * 현재는 pass-through이지만, 나중에 다음 작업을 수행할 수 있음:
 * - 중복 제거
 * - 정렬
 * - 유효성 검증
 * - 최적화
 */
export function prettifyPropsIR(props: PropIR[], spec: NodeSpec): PropIR[] {
  // 버튼이고
  // props에 state로 정의되고, Disable이 있다면
  // props에 state는 지우고
  // props 값으로 isDisabled boolean 형태로 받을 수 있어야 한다.

  return props;
}
