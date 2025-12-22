import React from "react";
import { css } from "@emotion/react";

type Size = "Large" | "Medium" | "Small";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  text: string;
}

const paddingBySize = {
  Large: { padding: "8px" },
  Medium: { padding: "7px 8px" },
  Small: { padding: "3px 4px" },
};

const iconBySize = {
  Large: { w: 18, h: 18 },
  Medium: { w: 16, h: 16 },
  Small: { w: 14, h: 14 },
} as const satisfies Record<Size, { w: number; h: number }>;

const textBySize = {
  Large: { fontSize: 16, lineHeight: 24 },
  Medium: { fontSize: 14, lineHeight: 22 },
  Small: { fontSize: 12, lineHeight: 18 },
} satisfies Record<Size, { fontSize: number; lineHeight: number }>;

const primaryButtonCss = ($size: Size) => css`
  align-items: center;
  background: var(--Primary-600, #15c5ce);
  border-radius: 4px;
  display: inline-flex;
  flex-direction: column; /* 원본 유지 */
  justify-content: center;

  ${paddingBySize[$size]}

  &:active {
    background: var(--Primary-700, #00abb6);
  }

  &:disabled {
    background: var(--Primary-300, #b0ebec);
  }

  &:hover {
    cursor: pointer;
    background: var(--Primary-500, #47cfd6);
  }
`;

const contentCss = css`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
`;

const iconSlotCss = ($size: Size) => css`
  width: ${iconBySize[$size].w}px;
  height: ${iconBySize[$size].h}px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;

  & > svg,
  & > img {
    width: 100%;
    height: 100%;
    display: block;
  }

  & > * {
    max-width: 100%;
    max-height: 100%;
  }
`;

const labelCss = ($size: Size) => css`
  color: var(--black-white-white, #fff);
  text-align: center;
  font-family: "PingFang SC";
  font-style: normal;
  font-weight: 500;

  font-size: ${textBySize[$size].fontSize}px;
  line-height: ${textBySize[$size].lineHeight}px;
`;

function PrimaryButton(props: ButtonProps) {
  const { size = "Large", leftIcon, rightIcon, text, ...buttonProps } = props;

  return (
    <button css={primaryButtonCss(size)} {...buttonProps}>
      <span css={contentCss}>
        {leftIcon ? <span css={iconSlotCss(size)}>{leftIcon}</span> : null}
        <span css={labelCss(size)}>{text}</span>
        {rightIcon ? <span css={iconSlotCss(size)}>{rightIcon}</span> : null}
      </span>
    </button>
  );
}

export default PrimaryButton;
