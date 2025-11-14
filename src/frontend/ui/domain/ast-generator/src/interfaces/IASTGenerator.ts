import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type { ComponentAST } from "../ast";

/**
 * Figma ComponentSetNodeSpec을 ComponentAST로 변환하는 인터페이스
 */
export interface IASTGenerator {
  /**
   * ComponentSetNodeSpec을 ComponentAST로 변환
   */
  componentNodeSpecToAST(spec: ComponentSetNodeSpec): ComponentAST;
}

