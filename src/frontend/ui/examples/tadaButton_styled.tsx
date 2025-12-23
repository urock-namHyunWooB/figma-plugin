import React from "react";
import { css } from "@emotion/react";

export type Size = "Large" | "Medium" | "Small";
export interface ButtonSolidPrimaryProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: Size;
  customDisabled?: boolean;
}

const ButtonSolidPrimaryBySize__873027 = {
  Large: { height: "48px", padding: "12px 28px" },
  Medium: { height: "40px", padding: "11px 20px" },
  Small: { padding: "8px 14px" },
};
const ButtonSolidPrimaryCss__873027 = (
  $size: ButtonSolidPrimaryProps["size"] = "Large",
  $customDisabled: ButtonSolidPrimaryProps["customDisabled"] = false
) => css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  border-radius: 6px;
  ${ButtonSolidPrimaryBySize__873027[$size]}
  ${$customDisabled
    ? { background: "var(--Primary-Alternative, #FFE799)" }
    : { background: "var(--Primary-Normal, #FFC400)" }}
`;
const ContentsCss__892908 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  ${""}
`;
const ContentsCss__892972 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  ${""}
`;
const LeftIconCss__25834208 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  ${""}
`;
const LabelBySize__873015 = {
  Large: { fontSize: "16px", lineHeight: "20px" },
  Medium: { fontSize: "14px", lineHeight: "18px" },
  Small: { fontSize: "12px", lineHeight: "16px" },
};
const LabelCss__873015 = (
  $customDisabled: ButtonSolidPrimaryProps["customDisabled"] = false,
  $size: ButtonSolidPrimaryProps["size"] = "Large"
) => css`
  text-align: center;
  font-family: Pretendard;
  font-style: normal;
  font-weight: 500;
  ${$customDisabled
    ? { color: "var(--Semantic-Label-Weak, var(--Label-Weak, #A6A9AB))" }
    : { color: "var(--Semantic-Static-Black, var(--Static-Black, #000))" }}
  ${LabelBySize__873015[$size]}
`;
const RightIconCss__25834623 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  ${""}
`;

export default function ButtonSolidPrimary(props: ButtonSolidPrimaryProps) {
  const {
    label = "Label",
    leftIcon = null,
    rightIcon = null,
    size = "Large",
    customDisabled = false,
    ...restProps
  } = props;
  return (
    <button
      css={ButtonSolidPrimaryCss__873027(size, customDisabled)}
      {...restProps}
    >
      <div css={ContentsCss__892908}>
        <div css={ContentsCss__892972}>
          {props.leftIcon}
          <span css={LabelCss__873015(customDisabled, size)}>{label}</span>
          {props.rightIcon}
        </div>
      </div>
    </button>
  );
}
