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

const btnBySize__4139411 = {
  L: { height: "56px", padding: "16px 28px", gap: "4px", borderRadius: "12px" },
  M: { height: "40px", padding: "8px 12px", gap: "2px", borderRadius: "10px" },
  S: { height: "28px", padding: "4px 8px", borderRadius: "8px" },
};
const btnByCustomType__4139411 = {
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
  outlined_black: {
    background: "var(--Color-bg-00, #FFF)",
    boxShadow:
      "0 10px var(--Number-scope-Blur-blur-6, 6px) 0 rgba(0, 0, 0, 0.01), 0 4px var(--Number-scope-Blur-blur-4, 4px) 0 rgba(0, 0, 0, 0.02), 0 1px var(--Number-scope-Blur-blur-2, 2px) 0 rgba(0, 0, 0, 0.02)",
    border: "2px solid var(--Color-line-01, #EDEDED)",
  },
  outlined_blue: {
    background: "var(--Color-bg-03, #F7F9FE)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(98, 140, 245, 0.16)",
    border: "2px solid var(--Color-line-03, #93B0F8)",
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
  outlined_red: {
    background: "var(--Color-bg-00, #FFF)",
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(248, 177, 177, 0.16)",
    border: "2px solid var(--Color-state-error, #FF8484)",
  },
  outlined_black: { backdropFilter: "blur(20px)" },
  "icon-outlined-black": { backdropFilter: "blur(20px)" },
};
const btnCss__4139411 = (
  $size: btnProps["size"] = "L",
  $customType: btnProps["customType"] = "filled"
) => css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(20px);
  ${btnBySize__4139411[$size]}

  ${btnByCustomType__4139411[$customType]}


  :hover {
    backdrop-filter: blur(20px);
    opacity: 0.7;
  }
  :active {
    opacity: 0.8;
    backdrop-filter: blur(20px);
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
const buttonByCustomType__4139413 = {
  filled: { color: "var(--Color-text-00, #FFF)" },
  "filled-red": { color: "var(--Color-text-00, #FFF)" },
  outlined_black: { color: "var(--Color-text-03-high, #1A1A1A)" },
  outlined_blue: { color: "var(--Color-text-04-primary, #4978EB)" },
  outlined_red: { color: "var(--Color-text-error, #EE4C54)" },
  text: { color: "var(--Color-text-04-primary, #4978EB)" },
  "text-black": { color: "var(--Color-text-03-high, #1A1A1A)" },
};
const buttonCss__4139413 = (
  $size: btnProps["size"] = "L",
  $customType: btnProps["customType"] = "filled"
) => css`
  text-align: center;
  font-style: normal;
  ${buttonBySize__4139413[$size]}
  ${buttonByCustomType__4139413[$customType]}
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
    <button css={btnCss__4139411(size, customType)} {...restProps}>
      {props.iconLeft}
      {(customType === "filled" ||
        customType === "filled-red" ||
        customType === "outlined_black" ||
        customType === "outlined_blue" ||
        customType === "outlined_red" ||
        customType === "text" ||
        customType === "text-black") && (
        <span css={buttonCss__4139413(size, customType)}>{text}</span>
      )}
      {props.iconRight}
    </button>
  );
}
