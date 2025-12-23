import React from "react";
import { css } from "@emotion/react";

export type Size = "Large" | "Medium" | "Small";
export type CustomDisabled = "False" | "True";
export interface ButtonSolidPrimaryProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  leftIcon?: boolean;
  rightIcon?: boolean;
  size?: Size;
  customDisabled?: CustomDisabled;
}

const ButtonSolidPrimaryBySize__873027 = {
  Large: { height: "48px", padding: "12px 28px" },
  Medium: { height: "40px", padding: "11px 20px" },
  Small: { padding: "8px 14px" },
};
const ButtonSolidPrimaryByCustomDisabled__873027 = {
  False: { background: "var(--Primary-Normal, #FFC400)" },
  True: { background: "var(--Primary-Alternative, #FFE799)" },
};
const ButtonSolidPrimaryCss__873027 = (
  $size: Size,
  $customDisabled: CustomDisabled
) => css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  border-radius: 6px;
  ${ButtonSolidPrimaryBySize__873027[$size]}
  ${ButtonSolidPrimaryByCustomDisabled__873027[$customDisabled]}
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
const LabelByCustomDisabled__873015 = {
  False: { color: "var(--Semantic-Static-Black, var(--Static-Black, #000))" },
  True: { color: "var(--Semantic-Label-Weak, var(--Label-Weak, #A6A9AB))" },
};
const LabelBySize__873015 = {
  Large: { fontSize: "16px", lineHeight: "20px" },
  Medium: { fontSize: "14px", lineHeight: "18px" },
  Small: { fontSize: "12px", lineHeight: "16px" },
};
const LabelCss__873015 = ($customDisabled: CustomDisabled, $size: Size) => css`
  text-align: center;
  font-family: Pretendard;
  font-style: normal;
  font-weight: 500;
  ${LabelByCustomDisabled__873015[$customDisabled]}
  ${LabelBySize__873015[$size]}
`;

export default function ButtonSolidPrimary(props: ButtonSolidPrimaryProps) {
  const {
    label = "Label",
    leftIcon = false,
    rightIcon = false,
    size = "Large",
    customDisabled = false,
    ...restProps
  } = props;
  return (
    <div css={ButtonSolidPrimaryCss__873027(size, customDisabled)}>
      <div css={ContentsCss__892908}>
        <div css={ContentsCss__892972}>
          <span css={LabelCss__873015(customDisabled, size)}>{label}</span>
        </div>
      </div>
    </div>
  );
}
