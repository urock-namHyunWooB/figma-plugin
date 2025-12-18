import React from "react";
import { css } from "@emotion/react";

interface Props {
  size?: "Large" | "Medium" | "Small";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const baseCss = css`
  align-items: center;
  background: var(--Primary-600, #15c5ce);
  border-radius: 4px;
  display: inline-flex;
  flex-direction: column;
  justify-content: center;

  &:active {
    background: var(--Primary-700, #00abb6);
  }

  &:disabled {
    background: var(--Primary-300, #b0ebec);
  }

  &:hover {
    background: var(--Primary-500, #47cfd6);
  }
`;

const sizeCss = {
  Large: css`
    padding: 8px;
    border: 1px solid #000;
  `,
  Medium: css`
    padding: 7px 8px;
  `,
  Small: css`
    padding: 3px 4px;
  `,
};

const Plus15_12975 = {
  Large: css`
    width: 18px;
    height: 18px;
  `,
  Medium: css`
    width: 16px;
    height: 16px;
  `,
  Small: css`
    width: 14px;
    height: 14px;
  `,
};

const Plus15_12981 = {
  Large: css`
    width: 18px;
    height: 18px;
  `,
  Medium: css`
    width: 16px;
    height: 16px;
  `,
  Small: css`
    width: 14px;
    height: 14px;
  `,
};

const Text15_12976 = css`
  color: var(--black-white-white, #FFF);
  text-align: center;
  font-family: '"PingFang SC"';
  "font-style": "normal";
  "font-weight": "500";
  
  
`;

const Text15_12976Size = {
  Large: css`
    "font-size":"16px","line-height": "24px /* 150% */";
  `,
  Medium: css`
    "font-size":"14px","line-height": "22px /* 157.143% */";
  `,
  Small: css`
    "font-size":"12px","line-height": "18px /* 150% */";
  `,
};

function Primary(props: Props) {
  const { size = "Large", leftIcon, rightIcon } = props;

  return (
    <button css={baseCss}>
      <div
        css={css`
          align-items: center;
          display: flex;
          gap: 4px;
          justify-content: center;
        `}
      >
        {leftIcon && <div css={Plus15_12975[size]}>{leftIcon}</div>}
        <span css={(Text15_12976, Text15_12976Size[size])}>Button</span>
        {rightIcon && <div css={Plus15_12981[size]}>{rightIcon}</div>}
      </div>
    </button>
  );
}

export default Primary;
