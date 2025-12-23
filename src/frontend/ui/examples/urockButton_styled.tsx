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
  L: { height: "56px", gap: "4px" },
  M: { height: "40px", gap: "2px" },
  S: { height: "28px" },
};
const btnByCustomType__4139411 = {
  filled: {
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(98, 140, 245, 0.16)",
  },
  "filled-red": {
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(248, 177, 177, 0.16)",
    opacity: "0.8",
  },
  outlined_black: {
    boxShadow:
      "0 10px var(--Number-scope-Blur-blur-6, 6px) 0 rgba(0, 0, 0, 0.01), 0 4px var(--Number-scope-Blur-blur-4, 4px) 0 rgba(0, 0, 0, 0.02), 0 1px var(--Number-scope-Blur-blur-2, 2px) 0 rgba(0, 0, 0, 0.02)",
  },
  outlined_blue: {
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(98, 140, 245, 0.16)",
  },
  "icon-filled": {
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(98, 140, 245, 0.16)",
  },
  "icon-filled-red": {
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(248, 177, 177, 0.16)",
  },
  "icon-outlined-black": {
    boxShadow:
      "0 10px var(--Number-scope-Blur-blur-6, 6px) 0 rgba(0, 0, 0, 0.01), 0 4px var(--Number-scope-Blur-blur-4, 4px) 0 rgba(0, 0, 0, 0.02), 0 1px var(--Number-scope-Blur-blur-2, 2px) 0 rgba(0, 0, 0, 0.02)",
  },
  "icon-outlined-blue": {
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(98, 140, 245, 0.16)",
  },
  "icon-outlined-red": {
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(248, 177, 177, 0.16)",
  },
  outlined_red: {
    boxShadow:
      "-1px 5px var(--Number-scope-Blur-blur-14, 14px) 0 rgba(248, 177, 177, 0.16)",
    opacity: "0.7",
  },
};
const btnCss__4139411 = ($size: Size, $customType: CustomType) => css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  padding: 6px;
  border-radius: 8px;
  background: var(--Color-bg-00, #fff);
  border: 2px solid var(--Color-state-error, #ff8484);
  backdrop-filter: blur(20px);
  ${btnBySize__4139411[$size]}

  ${btnByCustomType__4139411[$customType]}


  :hover {
    padding: 4px 8px;
    border-radius: 8px;
    background: var(--Color-bg-error, #ffb9b9);
    border: 2px solid var(--Color-state-error, #ff8484);
    backdrop-filter: blur(20px);
  }
  :active {
    padding: 4px 8px;
    border-radius: 8px;
    background: var(--Color-bg-error, #ffb9b9);
    border: 2px solid var(--Color-state-error, #ff8484);
    backdrop-filter: blur(20px);
  }
  :disabled {
    padding: 4px 8px;
    border-radius: 8px;
    background: var(--Color-bg-02, #e6e6e6);
  }
`;
const icon_arrowBySize__4139412 = {
  L: { width: "24px", height: "24px" },
  M: { width: "20px", height: "20px" },
  S: { width: "16px", height: "16px" },
};
const icon_arrowCss__4139412 = ($size: Size) => css`
  ${icon_arrowBySize__4139412[$size]}
`;
const buttonBySize__4139413 = {
  L: { lineHeight: "136%" },
  M: { lineHeight: "148%" },
  S: { lineHeight: "140%" },
};
const buttonCss__4139413 = ($size: Size) => css`
  text-align: center;
  font-style: normal;
  color: var(--Color-text-00, #fff);
  font-family: Pretendard;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.5px;
  ${buttonBySize__4139413[$size]}

  :hover {
    color: var(--Color-text-05-dark, #91b1ff);
    font-family: var(--Typography-Font-Famaily-pretendard-text, Pretendard);
    font-size: var(--Typography-Font-Size-fontSize-14px, 14px);
    font-weight: var(--Typography-Font-Weight-semibold-600, 600);
    letter-spacing: var(
      --Typography-Letter-Spacing-latterSpacing-neg0_5px,
      -0.5px
    );
  }
  :active {
    color: var(--Color-text-03-high, #1a1a1a);
    font-family: var(--Typography-Font-Famaily-pretendard-text, Pretendard);
    font-size: var(--Typography-Font-Size-fontSize-14px, 14px);
    font-weight: var(--Typography-Font-Weight-semibold-600, 600);
    letter-spacing: var(
      --Typography-Letter-Spacing-latterSpacing-neg0_5px,
      -0.5px
    );
  }
  :disabled {
    color: var(--Color-text-01-disable, #a7a7a7);
    font-family: var(--Typography-Font-Famaily-pretendard-text, Pretendard);
    font-size: var(--Typography-Font-Size-fontSize-14px, 14px);
    font-weight: var(--Typography-Font-Weight-semibold-600, 600);
    letter-spacing: var(
      --Typography-Letter-Spacing-latterSpacing-neg0_5px,
      -0.5px
    );
  }
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
      <span css={buttonCss__4139413(size)}>{text}</span>
      {props.iconRight}
    </button>
  );
}
