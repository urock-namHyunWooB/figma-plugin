/**
 * AST Generator 타입 정의
 */

import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";

/**
 * Component DSL 타입 정의
 * SpecManager.getComponentSetNodeSpec()의 반환 타입을 그대로 사용
 */
export type ComponentDSL = ComponentSetNodeSpec;
