/**
 * DataPreparer 모듈
 *
 * Figma 원본 데이터를 준비된 형태로 변환하는 모듈
 *
 * @example
 * ```typescript
 * import { DataPreparer } from '@code-generator/core/data-preparer';
 *
 * const preparer = new DataPreparer();
 * const prepared = preparer.prepare(figmaNodeData);
 * const node = prepared.getNodeById('123'); // O(1)
 * ```
 */

export { default as DataPreparer } from "./DataPreparer";
export { default as PreparedDesignData } from "./PreparedDesignData";
