/**
 * FeedbackPanel 통합 브라우저 테스트
 *
 * 실제 fixture로 컴파일 → feedbackGroups 추출 → FeedbackPanel 렌더 →
 * DOM/이벤트 검증.
 */
import { describe, test, expect, beforeAll, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as React from "react";
import FigmaCodeGenerator, { type FeedbackGroup } from "@code-generator2";
import { FeedbackPanel } from "@frontend/ui/components/FeedbackPanel";

import btnFixture from "../fixtures/failing/Btn.json";
import buttonFixture from "../fixtures/button/Button.json";

describe("FeedbackPanel (real fixtures)", () => {
  describe("failing/Btn — structural diagnostics가 있는 픽스처", () => {
    let groups: FeedbackGroup[];

    beforeAll(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compiler = new FigmaCodeGenerator(btnFixture as any);
      const result = await compiler.compileWithDiagnostics();
      groups = result.feedbackGroups;
    });

    test("FeedbackBuilder가 그룹을 1개 이상 만든다", () => {
      expect(groups.length).toBeGreaterThan(0);
    });

    test("모든 group의 sharedContext.nodeId가 비어있지 않다", () => {
      for (const group of groups) {
        expect(group.sharedContext.nodeId).toBeTruthy();
        expect(typeof group.sharedContext.nodeId).toBe("string");
      }
    });

    test("FeedbackPanel이 카드를 그룹 수만큼 렌더한다", () => {
      const onJump = vi.fn();
      const onItem = vi.fn();
      const onGroup = vi.fn();
      render(
        React.createElement(FeedbackPanel, {
          groups,
          onJumpToNode: onJump,
          onApplyFixItem: onItem,
          onApplyFixGroup: onGroup,
        })
      );

      // rootCauseHint 텍스트가 모두 화면에 있어야 함 (중복 가능 — 다른 nodeId의 같은 좌표)
      const hintCounts = new Map<string, number>();
      for (const g of groups) hintCounts.set(g.rootCauseHint, (hintCounts.get(g.rootCauseHint) ?? 0) + 1);
      for (const [hint, count] of hintCounts) {
        expect(screen.getAllByText(hint)).toHaveLength(count);
      }
      cleanup();
    });

    test("카드 헤더 클릭 시 items가 펼쳐진다", () => {
      render(
        React.createElement(FeedbackPanel, {
          groups: groups.slice(0, 1),
          onJumpToNode: () => {},
          onApplyFixItem: () => {},
          onApplyFixGroup: () => {},
        })
      );

      const firstGroup = groups[0];
      const firstItem = firstGroup.items[0];

      // 펼치기 전에는 cssProperty가 없어야 함 (헤더에는 rootCauseHint만)
      expect(screen.queryByText(firstItem.cssProperty)).toBeNull();

      // 헤더 클릭
      const header = screen.getByText(firstGroup.rootCauseHint);
      fireEvent.click(header);

      // 펼친 후 cssProperty 표시
      expect(screen.getByText(firstItem.cssProperty)).toBeInTheDocument();
      cleanup();
    });

    test("→ Figma 버튼 클릭 시 onJumpToNode가 nodeId를 받는다", () => {
      const onJump = vi.fn();
      render(
        React.createElement(FeedbackPanel, {
          groups: groups.slice(0, 1),
          onJumpToNode: onJump,
          onApplyFixItem: () => {},
          onApplyFixGroup: () => {},
        })
      );

      const firstGroup = groups[0];
      const firstItem = firstGroup.items[0];

      // 펼치기
      fireEvent.click(screen.getByText(firstGroup.rootCauseHint));

      // 첫 → Figma 버튼 클릭
      const jumpButtons = screen.getAllByText("→ Figma");
      expect(jumpButtons.length).toBeGreaterThan(0);
      fireEvent.click(jumpButtons[0]);

      expect(onJump).toHaveBeenCalledTimes(1);
      expect(onJump).toHaveBeenCalledWith(firstItem.nodeId);
      cleanup();
    });

    test("그룹 [Fix N] 버튼 클릭 시 onApplyFixGroup이 groupId를 받는다", () => {
      // canAutoFixGroup=true인 그룹만 골라야 버튼이 enabled
      const fixable = groups.find((g) => g.canAutoFixGroup);
      if (!fixable) {
        console.warn("[skip] no canAutoFix group in Btn fixture");
        return;
      }

      const onGroup = vi.fn();
      render(
        React.createElement(FeedbackPanel, {
          groups: [fixable],
          onJumpToNode: () => {},
          onApplyFixItem: () => {},
          onApplyFixGroup: onGroup,
        })
      );

      const fixableCount = fixable.items.filter((it) => it.canAutoFix).length;
      const fixButton = screen.getByText(`Fix ${fixableCount}`);
      fireEvent.click(fixButton);

      expect(onGroup).toHaveBeenCalledTimes(1);
      expect(onGroup).toHaveBeenCalledWith(fixable.id);
      cleanup();
    });
  });

  describe("button/Button — 일관성 문제 없는 픽스처", () => {
    test("그룹이 없거나 적으면 'no issue' 또는 일부만 렌더", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compiler = new FigmaCodeGenerator(buttonFixture as any);
      const result = await compiler.compileWithDiagnostics();

      render(
        React.createElement(FeedbackPanel, {
          groups: result.feedbackGroups,
          onJumpToNode: () => {},
          onApplyFixItem: () => {},
          onApplyFixGroup: () => {},
        })
      );

      // 그룹 0개면 "일관성 문제 없음" 메시지
      if (result.feedbackGroups.length === 0) {
        expect(screen.getByText("일관성 문제 없음")).toBeInTheDocument();
      }
      cleanup();
    });
  });
});
