import React from "react";

import { css } from "@emotion/react";

export type Size = "default" | "large" | "small";

export type Variant = "danger" | "default" | "primary" | "secondary";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  variant?: Variant;
  icon?: React.ReactNode;
  text?: string;
}

const ButtonCss = css`
  display: inline-flex;
  padding: 7px 12px;
  align-items: center;
  gap: 10px;
  border-radius: 3px;
  background: var(--Light-gray-2, #f2f2f2);
`;

const LabelCss = css`
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 13px;
  font-style: normal;
  font-weight: 600;
  line-height: 18px /* 138.462% */;
`;

export default function Button(props: ButtonProps) {
  const {
    size = "default",
    variant = "default",
    icon = null,
    text = "Default",
    ...restProps
  } = props;
  return (
    <button css={ButtonCss} {...restProps}>
      {icon}
      <span css={LabelCss}>{text}</span>
    </button>
  );
}
