/**
 * nodeData에서 렌더링에 필요한 기본 props를 추출
 * ArraySlot의 인스턴스 데이터를 기반으로 실제 props 생성
 */

import { FigmaNodeData } from "@compiler";
import ArraySlotDetector from "@compiler/core/ArraySlotDetector";
import { toCamelCase } from "@compiler/utils/normalizeString";

/**
 * ArraySlot 인스턴스의 componentProperties에서 props 객체 생성
 */
function extractInstanceProps(
  componentProperties: Record<string, any> | undefined
): Record<string, any> {
  if (!componentProperties) return {};

  const props: Record<string, any> = {};
  for (const [key, value] of Object.entries(componentProperties)) {
    const propName = toCamelCase(key);
    if (!propName) continue;

    // value.value가 실제 값
    const propValue = (value as any)?.value;
    if (propValue !== undefined) {
      props[propName] = propValue;
    }
  }
  return props;
}

/**
 * nodeData에서 렌더링에 필요한 기본 props 추출
 *
 * @param nodeData - Figma 노드 데이터
 * @returns 렌더링에 사용할 props 객체
 *
 * @example
 * const props = extractDefaultPropsFromNodeData(nodeData);
 * // { options: [{size: 'default', selected: 'true'}, ...], colorSwatchs: [...] }
 */
export function extractDefaultPropsFromNodeData(
  nodeData: FigmaNodeData
): Record<string, any> {
  const detector = new ArraySlotDetector(nodeData);
  const arraySlots = detector.detect();

  const props: Record<string, any> = {};

  for (const slot of arraySlots) {
    // 각 인스턴스의 componentProperties에서 props 추출
    const items = slot.instances.map((instance) =>
      extractInstanceProps(instance.componentProperties)
    );

    // slotName으로 props에 추가
    props[slot.slotName] = items;
  }

  return props;
}

export default extractDefaultPropsFromNodeData;
