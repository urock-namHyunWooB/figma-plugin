import React from "react";
import { css } from "@emotion/react";

export type Size = "Large" | "Medium" | "Small";
export interface ButtonSolidPrimaryProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: Size;
  disabled?: React.ReactNode;
}

const ButtonSolidPrimaryBySize__873027 = {
  Large: { height: "48px", padding: "12px 28px" },
  Medium: { height: "40px", padding: "11px 20px" },
  Small: { padding: "8px 14px" },
};
const ButtonSolidPrimaryByDisabled__873027 = {
  False: { background: "var(--Primary-Normal, #FFC400)" },
  True: { background: "var(--Primary-Alternative, #FFE799)" },
};
const ButtonSolidPrimaryCss__873027 = ($size: Size, $disabled: Disabled) => css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  border-radius: 6px;
  ${ButtonSolidPrimaryBySize__873027[$size]}
  ${ButtonSolidPrimaryByDisabled__873027[$disabled]}
`;
const ContentsCss__892908 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  ${""}
`;
const InteractionBySize__893234 = {
  Large: { width: "96px", height: "48px" },
  Medium: { width: "75px", height: "40px" },
  Small: { width: "58px", height: "32px" },
};
const InteractionCss__893234 = ($size: Size) => css`
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  ${InteractionBySize__893234[$size]}
`;
const ContentsCss__892972 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  ${""}
`;
const InteractiveBySize__893235 = {
  Large: { width: "96px", height: "48px" },
  Medium: { width: "75px", height: "40px" },
  Small: { width: "58px", height: "32px" },
};
const InteractiveCss__893235 = ($size: Size) => css`
  flex-shrink: 0;
  background: var(--Label-Normal, #000);
  ${InteractiveBySize__893235[$size]}
`;
const LeftIconCss__25834208 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  ${""}
`;
const LabelByDisabled__873015 = {
  False: { color: "var(--Semantic-Static-Black, var(--Static-Black, #000))" },
  True: { color: "var(--Semantic-Label-Weak, var(--Label-Weak, #A6A9AB))" },
};
const LabelBySize__873015 = {
  Large: { fontSize: "16px", lineHeight: "20px" },
  Medium: { fontSize: "14px", lineHeight: "18px" },
  Small: { fontSize: "12px", lineHeight: "16px" },
};
const LabelCss__873015 = ($disabled: Disabled, $size: Size) => css`
  text-align: center;
  font-family: Pretendard;
  font-style: normal;
  font-weight: 500;
  ${LabelByDisabled__873015[$disabled]}
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
    disabled = null,
    ...restProps
  } = props;
  return props.disabled;
}
