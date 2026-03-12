import React from "react";
import { css } from "@emotion/react";

export interface ChipsProps {
  iconLeft?: React.ReactNode; // default: null
  iconRight?: React.ReactNode; // default: null
  size?: "large" | "small"; // default: "large"
  color?:
    | "blue"
    | "cyan"
    | "gray"
    | "navy"
    | "red"
    | "skyblue"
    | "white-black"
    | "white-blue"; // default: "cyan"
  text?: string; // default: "Text"
}

const chipsCss = css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  border-radius: 999px;
  box-sizing: border-box;
`;

const chipsCss_sizeStyles = {
  small: css`
    padding: 2px 8px;
  `,
  large: css`
    padding: 4px 10px;
    gap: 2px;
  `,
};

const chipsCss_colorStyles = {
  cyan: css`
    border: 1px solid var(--line-05_focus, #050506);
    background: var(--bg-success, #aef2f6);
  `,
  red: css`
    border: 1px solid var(--line-05_focus, #050506);
    background: var(--bg-error, #ffb9b9);
  `,
  skyblue: css`
    border: 1px solid var(--line-05_focus, #050506);
    background: var(--Color-bg-04, #e6edff);
  `,
  "white-black": css`
    border: 1px solid var(--line-05_focus, #050506);
    background: var(--Color-bg-00, #fff);
  `,
  "white-blue": css`
    border: 1px solid var(--Color-line-02, #e9ebf8);
    background: var(--Color-bg-00, #fff);
  `,
  gray: css`
    border: 1px solid var(--Color-line-01, #ededed);
    background: var(--bg-01, #f9f9f9);
  `,
  navy: css`
    background: var(--Color-primary-02, #201d30);
  `,
  blue: css`
    background: var(--primary-01, #628cf5);
  `,
};

const chipsCheckingCss = css``;

const chipsCheckingCss_sizeStyles = {
  small: css`
    width: 12px;
    height: 12px;
  `,
  large: css`
    width: 16px;
    height: 16px;
  `,
};

const chipsTextCss = css`
  text-align: center;
  font-family: var(--Typography-famaily-text, Pretendard);
  font-style: normal;
  letter-spacing: var(--Typography-letter-spacing--05, -0.5px);
`;

const chipsTextCss_sizeStyles = {
  small: css`
    font-size: var(--Typography-size-14, 14px);
    font-weight: var(--Typography-weight-medium, 500);
    line-height: 140% /* 19.6px */;
  `,
  large: css`
    font-size: var(--Typography-size-16, 16px);
    font-weight: var(--Typography-weight-semibold, 600);
    line-height: 148% /* 23.68px */;
  `,
};

const chipsTextCss_colorStyles = {
  cyan: css`
    color: var(--text-03_high, #1a1a1a);
  `,
  red: css`
    color: var(--text-03_high, #1a1a1a);
  `,
  skyblue: css`
    color: var(--text-03_high, #1a1a1a);
  `,
  "white-black": css`
    color: var(--text-03_high, #1a1a1a);
  `,
  "white-blue": css`
    color: var(--text-03_high, #1a1a1a);
  `,
  gray: css`
    color: var(--Color-text-03-high, #1a1a1a);
  `,
  navy: css`
    color: var(--text-00, #fff);
  `,
  blue: css`
    color: var(--text-00, #fff);
  `,
};

const chipsFilledCss = css``;

const chipsFilledCss_sizeStyles = {
  small: css`
    width: 12px;
    height: 12px;
  `,
  large: css`
    width: 16px;
    height: 16px;
  `,
};

function Chips(props: ChipsProps) {
  const {
    iconLeft = null,
    iconRight = null,
    size = "large",
    color = "cyan",
    text = "Text",
    ...restProps
  } = props;

  return (
    <button
      css={[
        chipsCss,
        chipsCss_sizeStyles?.[size],
        chipsCss_colorStyles?.[color],
      ]}
      {...restProps}
    >
      {iconLeft && (
        <div css={[chipsCheckingCss, chipsCheckingCss_sizeStyles?.[size]]}>
          {iconLeft}
        </div>
      )}
      {text && (
        <div
          css={[
            chipsTextCss,
            chipsTextCss_sizeStyles?.[size],
            chipsTextCss_colorStyles?.[color],
          ]}
        >
          {text}
        </div>
      )}
      {iconRight && (
        <div css={[chipsFilledCss, chipsFilledCss_sizeStyles?.[size]]}>
          {iconRight}
        </div>
      )}
    </button>
  );
}

export default Chips;
