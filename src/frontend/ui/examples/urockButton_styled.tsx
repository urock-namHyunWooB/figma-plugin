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

const btnByCustomType__4139411 = {
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
};
const btnCss__4139411 = ($customType: btnProps["customType"] = "filled") => css`
  height: 28px;
  padding: 4px 8px;
  gap: 2px;
  ${btnByCustomType__4139411[$customType]}

  :hover {
    height: 28px;
    padding: 4px 8px;
    gap: 2px;
    opacity: 0.7;
  }
  :active {
    height: 28px;
    padding: 4px 8px;
    gap: 2px;
    opacity: 0.8;
  }
  :disabled {
    height: 28px;
    padding: 4px 8px;
    gap: 2px;
  }
`;
const icon_arrowBySize__4139412 = {
  L: { width: "24px", height: "24px" },
  M: { width: "20px", height: "20px" },
  S: { width: "16px", height: "16px" },
};
const icon_arrowCss__4139412 = ($size: btnProps["size"] = "L") => css`
  ${icon_arrowBySize__4139412[$size]}
`;
const buttonBySize__4139413 = {
  L: { lineHeight: "136%" },
  M: {
    lineHeight: "148%",
    fontFamily: "var(--Typography-Font-Famaily-pretendard-text, Pretendard)",
    fontSize: "var(--Typography-Font-Size-fontSize-16px, 16px)",
    fontWeight: "var(--Typography-Font-Weight-semibold-600, 600)",
    letterSpacing:
      "var(--Typography-Letter-Spacing-latterSpacing-neg0_5px, -0.5px)",
  },
  S: { lineHeight: "140%" },
};
const buttonCss__4139413 = ($size: btnProps["size"] = "L") => css`
  text-align: center;
  font-style: normal;
  ${buttonBySize__4139413[$size]}
`;
const icon_arrowCss__4139414 = css`
  width: 24px;
  height: 24px;
  ${""}
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
    <button css={btnCss__4139411(customType)} {...restProps}>
      {props.iconLeft}
      <span css={buttonCss__4139413(size)}>{text}</span>
      {props.iconRight}
    </button>
  );
}
