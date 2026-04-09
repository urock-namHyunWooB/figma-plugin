import type { VariantInconsistency } from "../types/types";
import type { FeedbackGroup, FeedbackItem } from "./types";
import { summarizeGroup, summarizeItem } from "./summarize";

/**
 * VariantInconsistency[]를 UI 소비용 FeedbackGroup[]로 변환.
 *
 * 그룹핑 규칙: 같은 (nodeId, variant coordinate) 항목들은 한 그룹.
 * 한 Figma 노드의 같은 variant 좌표에서 여러 CSS 속성이 동시에 깨졌다면
 * 디자이너가 그 variant 하나를 잘못 만졌을 가능성이 높으므로 한 묶음으로 표시.
 */
export class FeedbackBuilder {
  static build(
    diagnostics: VariantInconsistency[],
    componentSetName: string
  ): FeedbackGroup[] {
    const groupMap = new Map<string, {
      nodeId: string;
      variantCoordinate: Record<string, string>;
      items: FeedbackItem[];
    }>();

    for (const d of diagnostics) {
      if (!d.nodeId) continue; // nodeId 없는 진단은 UI에 표시 불가

      const expected = d.expectedValue;
      for (const v of d.variants) {
        // expectedValue 기준 outlier만 item으로 만듦
        // expected가 null이면 모든 variant를 item으로 (tie 케이스)
        if (expected !== null && v.value === expected) continue;

        const coordKey = JSON.stringify(v.props);
        const groupKey = `${d.nodeId}|${coordKey}`;

        let group = groupMap.get(groupKey);
        if (!group) {
          group = {
            nodeId: d.nodeId,
            variantCoordinate: { ...v.props },
            items: [],
          };
          groupMap.set(groupKey, group);
        }

        const item: FeedbackItem = {
          id: `${groupKey}#${d.cssProperty}`,
          cssProperty: d.cssProperty,
          actualValue: v.value,
          expectedValue: expected,
          nodeId: d.nodeId,
          variantCoordinate: { ...v.props },
          canAutoFix: expected !== null,
          reason: "",
        };
        item.reason = summarizeItem(item);
        group.items.push(item);
      }
    }

    const result: FeedbackGroup[] = [];
    let i = 0;
    for (const { nodeId, variantCoordinate, items } of groupMap.values()) {
      if (items.length === 0) continue;
      result.push({
        id: `g${i++}`,
        componentSetName,
        rootCauseHint: summarizeGroup(items, variantCoordinate),
        sharedContext: { nodeId, variantCoordinate },
        items,
        canAutoFixGroup: items.some((it) => it.canAutoFix),
      });
    }

    return result;
  }
}
