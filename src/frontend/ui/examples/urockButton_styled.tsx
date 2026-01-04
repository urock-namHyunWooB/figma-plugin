import React from "react";
import { css } from "@emotion/react";

export type Size = "L" | "M" | "S";
export type CustomType =
  | "filled"
  | "filled-red"
  | "icon-filled"
  | "icon-filled-red"
  | "icon-outlined-black"
  | "icon-outlined-blue"
  | "icon-outlined-red"
  | "outlined_black"
  | "outlined_blue"
  | "outlined_red"
  | "text"
  | "text-black";
export interface BtnProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  text?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  customType?: CustomType;
}

const btnSizeStyles = {
  L: { height: "56px", padding: "16px 28px", gap: "4px", borderRadius: "12px" },
  M: { height: "40px", padding: "8px 12px", gap: "2px", borderRadius: "10px" },
  S: { height: "28px", padding: "4px 8px", borderRadius: "8px" },
};
const btnCustomTypeStyles = {
  filled: {
    background: "var(--Color-primary-01, #628CF5)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(98, 140, 245, 0.16)",
  },
  "filled-red": {
    background: "var(--Color-state-error, #FF8484)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(248, 177, 177, 0.16)",
  },
  "icon-filled": {
    background: "var(--Color-primary-01, #628CF5)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(98, 140, 245, 0.16)",
  },
  "icon-filled-red": {
    background: "var(--Color-state-error, #FF8484)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(248, 177, 177, 0.16)",
  },
  "icon-outlined-black": {
    background: "var(--Color-bg-00, #FFF)",
    boxShadow:
      "0 10px var(--Number-scope-Blur-blur-6, 6px) 0 rgba(0, 0, 0, 0.01), 0 4px var(--Number-scope-Blur-blur-4, 4px) 0 rgba(0, 0, 0, 0.02), 0 1px var(--Number-scope-Blur-blur-2, 2px) 0 rgba(0, 0, 0, 0.02)",
    border: "2px solid var(--Color-line-01, #EDEDED)",
    backdropFilter: "blur(20px)",
  },
  "icon-outlined-blue": {
    background: "var(--Color-bg-03, #F7F9FE)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(98, 140, 245, 0.16)",
    border: "2px solid var(--Color-line-03, #93B0F8)",
  },
  "icon-outlined-red": {
    background: "var(--Color-bg-00, #FFF)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(248, 177, 177, 0.16)",
    border: "2px solid var(--Color-state-error, #FF8484)",
  },
  outlined_black: {
    background: "var(--Color-bg-00, #FFF)",
    boxShadow:
      "0 10px var(--Number-scope-Blur-blur-6, 6px) 0 rgba(0, 0, 0, 0.01), 0 4px var(--Number-scope-Blur-blur-4, 4px) 0 rgba(0, 0, 0, 0.02), 0 1px var(--Number-scope-Blur-blur-2, 2px) 0 rgba(0, 0, 0, 0.02)",
    border: "2px solid var(--Color-line-01, #EDEDED)",
    backdropFilter: "blur(20px)",
  },
  outlined_blue: {
    background: "var(--Color-bg-03, #F7F9FE)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(98, 140, 245, 0.16)",
    border: "2px solid var(--Color-line-03, #93B0F8)",
  },
  outlined_red: {
    background: "var(--Color-bg-00, #FFF)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(248, 177, 177, 0.16)",
    border: "2px solid var(--Color-state-error, #FF8484)",
  },
  text: {},
  "text-black": {},
};
const btnCss = (
  $size: NonNullable<BtnProps["size"]>,
  $customType: NonNullable<BtnProps["customType"]>
) => css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(20px);
  ${btnSizeStyles[$size]}

  ${btnCustomTypeStyles[$customType]}


  :hover {
    backdrop-filter: blur(20px);
    opacity: 0.7;
  }
  :active {
    opacity: 0.8;
    backdrop-filter: blur(20px);
  }
`;
const buttonSizeStyles = {
  L: {
    fontFamily: "var(--Typography-Font-Famaily-pretendard-text, Pretendard)",
    fontSize: "var(--Typography-Font-Size-fontSize-18px, 18px)",
    fontWeight: "var(--Typography-Font-Weight-semibold-600, 600)",
    lineHeight: "136%",
    letterSpacing:
      "var(--Typography-Letter-Spacing-latterSpacing-neg0_5px, -0.5px)",
  },
  M: {
    fontFamily: "var(--Typography-Font-Famaily-pretendard-text, Pretendard)",
    fontSize: "var(--Typography-Font-Size-fontSize-16px, 16px)",
    fontWeight: "var(--Typography-Font-Weight-semibold-600, 600)",
    lineHeight: "148%",
    letterSpacing:
      "var(--Typography-Letter-Spacing-latterSpacing-neg0_5px, -0.5px)",
  },
  S: {
    fontFamily: "Pretendard",
    fontSize: "14px",
    fontWeight: "600",
    lineHeight: "140%",
    letterSpacing: "-0.5px",
  },
};
const buttonCustomTypeStyles = {
  filled: { color: "var(--Color-text-00, #FFF)" },
  "filled-red": { color: "var(--Color-text-00, #FFF)" },
  "icon-filled": {},
  "icon-filled-red": {},
  "icon-outlined-black": {},
  "icon-outlined-blue": {},
  "icon-outlined-red": {},
  outlined_black: { color: "var(--Color-text-03-high, #1A1A1A)" },
  outlined_blue: { color: "var(--Color-text-04-primary, #4978EB)" },
  outlined_red: { color: "var(--Color-text-error, #EE4C54)" },
  text: { color: "var(--Color-text-04-primary, #4978EB)" },
  "text-black": { color: "var(--Color-text-03-high, #1A1A1A)" },
};
const buttonCss = (
  $size: NonNullable<BtnProps["size"]>,
  $customType: NonNullable<BtnProps["customType"]>
) => css`
  text-align: center;
  font-style: normal;
  ${buttonSizeStyles[$size]}
  ${buttonCustomTypeStyles[$customType]}
`;

export default function Btn(props: BtnProps) {
  const {
    size = "L",
    text = "button",
    iconLeft = null,
    iconRight = null,
    customType = "filled",
    ...restProps
  } = props;
  return (
    <button css={btnCss(size, customType)} {...restProps}>
      {iconLeft}
      {[
        "filled",
        "filled-red",
        "outlined_black",
        "outlined_blue",
        "outlined_red",
        "text",
        "text-black",
      ].includes(customType) && (
        <span css={buttonCss(size, customType)}>{text}</span>
      )}
      {iconRight}
    </button>
  );
}
