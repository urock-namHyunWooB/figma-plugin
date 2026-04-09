/**
 * FeedbackPanel
 *
 * Variant style 일관성 피드백을 접힌 카드 리스트로 표시.
 * 각 그룹: 요약 → 클릭하면 원자 단위 상세 펼침.
 * 각 item에 [→ Figma] (jump-to-node), [Fix] (fix-assist) 버튼.
 */

import { useState } from "react";
import { css } from "@emotion/react";
import type { FeedbackGroup } from "@code-generator2";

interface FeedbackPanelProps {
  groups: FeedbackGroup[];
  onJumpToNode: (nodeId: string) => void;
  onApplyFixItem: (itemId: string) => void;
  onApplyFixGroup: (groupId: string) => void;
}

const containerStyle = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  max-height: 100%;
  overflow-y: auto;
`;

const emptyStyle = css`
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
`;

const cardStyle = css`
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
`;

const headerStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;

  &:hover {
    background: #f9fafb;
  }
`;

const badgeStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 50%;
  font-size: 10px;
`;

const hintStyle = css`
  flex: 1;
  color: #111827;
`;

const fixGroupButtonStyle = css`
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid #3b82f6;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 4px;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const chevronStyle = css`
  width: 12px;
  height: 12px;
  color: #6b7280;
`;

const itemsContainerStyle = css`
  border-top: 1px solid #e5e7eb;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const itemStyle = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #e5e7eb;

  &:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }
`;

const itemPropRow = css`
  font-weight: 600;
  color: #374151;
`;

const itemValueRow = css`
  color: #6b7280;
  font-family: ui-monospace, monospace;
`;

const itemActions = css`
  display: flex;
  gap: 4px;
  margin-top: 4px;
`;

const actionButtonStyle = css`
  padding: 3px 6px;
  font-size: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;

  &:hover {
    background: #f3f4f6;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export function FeedbackPanel({
  groups,
  onJumpToNode,
  onApplyFixItem,
  onApplyFixGroup,
}: FeedbackPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (groups.length === 0) {
    return <div css={emptyStyle}>일관성 문제 없음</div>;
  }

  const toggle = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div css={containerStyle}>
      {groups.map((group) => {
        const isExpanded = expanded.has(group.id);
        const fixableCount = group.items.filter((it) => it.canAutoFix).length;
        return (
          <div key={group.id} css={cardStyle}>
            <div css={headerStyle} onClick={() => toggle(group.id)}>
              <span css={badgeStyle}>!</span>
              <span css={hintStyle}>{group.rootCauseHint}</span>
              <button
                css={fixGroupButtonStyle}
                disabled={!group.canAutoFixGroup}
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyFixGroup(group.id);
                }}
              >
                Fix {fixableCount}
              </button>
              <svg css={chevronStyle} viewBox="0 0 12 12" fill="currentColor">
                {isExpanded ? <path d="M3 5l3 3 3-3" /> : <path d="M5 3l3 3-3 3" />}
              </svg>
            </div>
            {isExpanded && (
              <div css={itemsContainerStyle}>
                {group.items.map((item) => (
                  <div key={item.id} css={itemStyle}>
                    <div css={itemPropRow}>{item.cssProperty}</div>
                    <div css={itemValueRow}>
                      실제: {item.actualValue}
                      {item.expectedValue !== null && ` → 기대: ${item.expectedValue}`}
                      {item.expectedValue === null && " (기대값 계산 불가)"}
                    </div>
                    <div css={itemActions}>
                      <button
                        css={actionButtonStyle}
                        onClick={() => onJumpToNode(item.nodeId)}
                      >
                        → Figma
                      </button>
                      <button
                        css={actionButtonStyle}
                        disabled={!item.canAutoFix}
                        onClick={() => onApplyFixItem(item.id)}
                      >
                        Fix
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FeedbackPanel;
