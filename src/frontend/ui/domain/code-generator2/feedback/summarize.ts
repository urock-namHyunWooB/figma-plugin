import type { FeedbackItem } from "./types";

/** 단일 item에 대한 사람 읽을 요약 */
export function summarizeItem(item: FeedbackItem): string {
  const variantText = Object.entries(item.variantCoordinate)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  if (item.expectedValue === null) {
    return `${item.cssProperty} @ ${variantText}: ${item.actualValue} (기대값 계산 불가 — 동점)`;
  }
  return `${item.cssProperty} @ ${variantText}: ${item.actualValue} → 기대 ${item.expectedValue}`;
}

/** 그룹 헤더 요약 */
export function summarizeGroup(
  items: FeedbackItem[],
  variantCoordinate: Record<string, string>
): string {
  const variantText = Object.entries(variantCoordinate)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  if (items.length === 1) {
    return `${variantText}에서 ${items[0].cssProperty} 불일치`;
  }
  return `${variantText}에서 ${items.length}개 속성 일관성 깨짐`;
}
