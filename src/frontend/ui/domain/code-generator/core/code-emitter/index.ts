/**
 * CodeEmitter Module
 *
 * DesignTree를 플랫폼별 코드로 변환하는 모듈.
 * 현재는 React만 지원하며, 향후 Vue, Svelte 등으로 확장 가능합니다.
 *
 * Phase 5 리팩토링 후: 레거시 react-generator/와 adapters/를 제거하고,
 * 새로운 generators/와 style-strategy/를 사용합니다.
 *
 * @example
 * ```typescript
 * import { ReactEmitter } from "@code-generator/core/code-emitter";
 *
 * const emitter = new ReactEmitter();
 * const result = await emitter.emit(designTree, {
 *   platform: "react",
 *   styleStrategy: "emotion"
 * });
 * ```
 */

export { default as ReactEmitter } from "./ReactEmitter";

// Generators (DesignTree에서 직접 코드 생성)
export * from "./generators";

// Style Strategies (Emotion, Tailwind)
export * from "./style-strategy";

// Utilities
export { toPascalCase, toCamelCase } from "./utils";
