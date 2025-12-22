import React from "react";
import { css } from "@emotion/css";

export type Size = "Large" | "Medium" | "Small";
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  text?: string;
}

const SizeLargeStateDisabledLeftIconFalseRightIconFalseBySize__1512969 = {
  Large: { padding: "8px" },
  Medium: { padding: "7px 8px" },
  Small: { padding: "3px 4px" },
};
const SizeLargeStateDisabledLeftIconFalseRightIconFalseCss__1512969 = (
  $size: Size
) => css`
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 4px;
  background: var(--Primary-600, #15c5ce);
  ${SizeLargeStateDisabledLeftIconFalseRightIconFalseBySize__1512969[$size]}

  :disabled {
    background: var(--Primary-300, #b0ebec);
  }
  :active {
    background: var(--Primary-700, #00abb6);
  }
  :hover {
    background: var(--Primary-500, #47cfd6);
  }
`;
const Frame427318163Css__1512974 = css`
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
  ${""}
`;
const PlusBySize__1512975 = {
  Large: { width: "18px", height: "18px" },
  Medium: { width: "16px", height: "16px" },
  Small: { width: "14px", height: "14px" },
};
const PlusCss__1512975 = ($size: Size) => css`
  ${PlusBySize__1512975[$size]}
`;
const TextBySize__1512976 = {
  Large: { "font-size": "16px", "line-height": "24px" },
  Medium: { "font-size": "14px", "line-height": "22px" },
  Small: { "font-size": "12px", "line-height": "18px" },
};
const TextCss__1512976 = ($size: Size) => css`
  color: var(--black-white-white, #fff);
  text-align: center;
  font-family: "PingFang SC";
  font-style: normal;
  font-weight: 500;
  ${TextBySize__1512976[$size]}
`;
const PlusCss__1512981 = css`
  width: 18px;
  height: 18px;
  ${""}
`;
const UnionBySize_I151297529722915 = {
  Large: { width: "15px", height: "15px" },
  Medium: { width: "13.333px", height: "13.333px" },
  Small: { width: "11.667px", height: "11.667px" },
};
const UnionCss_I151297529722915 = ($size: Size) => css`
  fill: var(--black-white-white, #fff);
  ${UnionBySize_I151297529722915[$size]}
`;
const UnionCss_I151298129722915 = css`
  width: 15px;
  height: 15px;
  fill: var(--black-white-white, #fff);
  ${""}
`;

export default function Button(props: ButtonProps) {
  const {
    size = "Large",
    leftIcon = null,
    rightIcon = null,
    text = "Text",
    ...restProps
  } = props;
  return (
    <div
      css={SizeLargeStateDisabledLeftIconFalseRightIconFalseCss__1512969(size)}
    >
      <div css={Frame427318163Css__1512974}>
        {props.leftIcon}
        <span css={TextCss__1512976(size)}>{text}</span>
        {props.rightIcon}
      </div>
    </div>
  );
}
