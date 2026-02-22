/* eslint-disable */
import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-react";
import React from "react";
import { css } from "@emotion/react";

/**
 * 브라우저에서 disabled 스타일 적용 테스트
 */
describe("Disabled 스타일 브라우저 테스트", () => {
  // Large.json 컴파일 결과와 동일한 패턴
  const AColorStyles = {
    Primary: { color: "rgb(255, 255, 255)" }, // white
    Light: { color: "rgb(0, 0, 0)" }, // black
  };

  function ACss($color: "Primary" | "Light", $customDisabled: boolean) {
    return css`
      font-size: 16px;
      ${AColorStyles[$color]}
      ${$customDisabled ? { color: "#B2B2B2" } : {}}
    `;
  }

  function TestComponent({
    color,
    customDisabled,
  }: {
    color: "Primary" | "Light";
    customDisabled: boolean;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (
      <span data-testid="text" css={ACss(color, customDisabled)}>
        Button Text
      </span>
    );
  }

  test("disabled=false일 때 Primary 색상(white) 적용", async () => {
    const { getByTestId } = render(
      <TestComponent color="Primary" customDisabled={false} />
    );

    const element = getByTestId("text");
    const computedStyle = window.getComputedStyle(element.element());

    console.log("disabled=false, color:", computedStyle.color);

    // white (rgb(255, 255, 255))가 적용되어야 함
    expect(computedStyle.color).toBe("rgb(255, 255, 255)");
  });

  test("disabled=true일 때 회색(#B2B2B2) 적용", async () => {
    const { getByTestId } = render(
      <TestComponent color="Primary" customDisabled={true} />
    );

    const element = getByTestId("text");
    const computedStyle = window.getComputedStyle(element.element());

    console.log("disabled=true, color:", computedStyle.color);

    // #B2B2B2 (rgb(178, 178, 178))가 적용되어야 함
    expect(computedStyle.color).toBe("rgb(178, 178, 178)");
  });
});
