import React from "react";

import { css } from "@emotion/react";


// === Decorateinteractive ===
export type Pressed = "True";

export interface DecorateinteractiveProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: Pressed;
  children?: React.ReactNode;
}

const DecorateinteractiveCss = css`
  width: 100%;
  height: 100%;`;

function Decorateinteractive(props: DecorateinteractiveProps) {
  const { pressed = "True", children, ...restProps } = props;
  return (
    <button css={DecorateinteractiveCss} {...restProps}>
      {children}
    </button>
  );
}


// === Large ===
export type Size = "Large" | "Medium";

export type Color = "Primary" | "Light" | "Neutral" | "Black";

export interface LargeProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  color?: Color;
  customDisabled?: boolean;
  text?: string;
  children?: React.ReactNode;
}

const LargeSizeStyles = {
  Large: { height: "56px" },
  Medium: { height: "48px" },
};

const LargeColorStyles = {
  Primary: { background: "var(--Primary-Normal, #0050FF)" },
  Light: { background: "#EDEFF2" },
  Neutral: { background: "#595B5E" },
  Black: { background: "var(--Static-Black, #000)" },
};

const LargeDisabledColorStyles = {
  Primary: { background: "#CCE2FF" },
  Light: {},
  Neutral: { background: "#979797" },
  Black: { background: "#2A2A2A" },
};

const LargeCss = (
  $size: NonNullable<LargeProps["size"]>,
  $color: NonNullable<LargeProps["color"]>,
  $customDisabled: NonNullable<LargeProps["customDisabled"]>
) => css`
  display: inline-flex;
  padding: 18px 16px;
  justify-content: center;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
${LargeSizeStyles[$size]}
${LargeColorStyles[$color]}
${$customDisabled ? LargeDisabledColorStyles[$color] : {}}
`;

const AColorStyles = {
  Primary: { color: "var(--Semantic-Static-White, var(--Static-White, #FFF))" },
  Light: { color: "var(--Semantic-Static-Black, var(--Static-Black, #000))" },
  Neutral: { color: "var(--Semantic-Static-White, var(--Static-White, #FFF))" },
  Black: { color: "var(--Semantic-Static-White, var(--Static-White, #FFF))" },
};

const ADisabledColorStyles = {
  Primary: {},
  Light: { color: "#B2B2B2" },
  Neutral: { color: "#B2B2B2" },
  Black: { color: "#B2B2B2" },
};

const ACss = (
  $color: NonNullable<LargeProps["color"]>,
  $customDisabled: NonNullable<LargeProps["customDisabled"]>
) => css`
  text-align: center;
  font-feature-settings: 'liga' off, 'clig' off;
  font-family: Pretendard;
  font-size: 16px;
  font-style: normal;
  font-weight: 700;
  line-height: 20px /* 125% */;
${AColorStyles[$color]}
${$customDisabled ? ADisabledColorStyles[$color] : {}}
`;

export default function Large(props: LargeProps) {
  const {
    size = "Large",
    color = "Primary",
    customDisabled = false,
    text = "Button",
    children,
    ...restProps
  } = props;
  return (
    <button
      css={LargeCss(size, color, customDisabled)}
      disabled={customDisabled}
      {...restProps}
    >
      <span css={ACss(color, customDisabled)}>{text}</span>
      {children}
    </button>
  );
}
