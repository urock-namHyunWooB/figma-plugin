import React from "react";
import { css } from "@emotion/react";

export type Size = "Large" | "Medium" | "Small";
export interface PrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  text?: string;
}

const PrimaryButtonBySize__1512969 = {
  Large: { padding: "8px" },
  Medium: { padding: "7px 8px" },
  Small: { padding: "3px 4px" },
};
const PrimaryButtonCss__1512969 = (
  $size: PrimaryButtonProps["size"] = "Large"
) => css`
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 4px;
  background: var(--Primary-300, #b0ebec);
  ${PrimaryButtonBySize__1512969[$size]}
`;

export default function PrimaryButton(props: PrimaryButtonProps) {
  const {
    size = "Large",
    leftIcon = null,
    rightIcon = null,
    text = "Text",
    ...restProps
  } = props;
  return (
    <button css={PrimaryButtonCss__1512969(size)} {...restProps}>
      <div>
        {props.leftIcon}
        <span>{text}</span>
        {props.rightIcon}
      </div>
    </button>
  );
}
