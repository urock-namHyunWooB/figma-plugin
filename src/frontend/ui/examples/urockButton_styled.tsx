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

const btnBySize__4139411 = { L: { borderRadius: "12px" } };
const btnCss__4139411 = ($size: btnProps["size"] = "L") => css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  ${btnBySize__4139411[$size]}
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
  M: { lineHeight: "148%" },
  S: { lineHeight: "140%" },
};
const buttonCss__4139413 = ($size: btnProps["size"] = "L") => css`
  text-align: center;
  font-style: normal;
  ${buttonBySize__4139413[$size]}

  :hover {
    font-family: var(--Typography-Font-Famaily-pretendard-text, Pretendard);
    font-weight: var(--Typography-Font-Weight-semibold-600, 600);
    letter-spacing: var(
      --Typography-Letter-Spacing-latterSpacing-neg0_5px,
      -0.5px
    );
  }
  :active {
    font-family: var(--Typography-Font-Famaily-pretendard-text, Pretendard);
    font-weight: var(--Typography-Font-Weight-semibold-600, 600);
    letter-spacing: var(
      --Typography-Letter-Spacing-latterSpacing-neg0_5px,
      -0.5px
    );
  }
  :disabled {
    font-family: var(--Typography-Font-Famaily-pretendard-text, Pretendard);
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
    <button css={btnCss__4139411(size)} {...restProps}>
      {props.iconLeft}
      <span css={buttonCss__4139413(size)}>{text}</span>
      {props.iconRight}
    </button>
  );
}
