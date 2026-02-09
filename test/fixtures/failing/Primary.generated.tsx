import React from "react";
import { css } from "@emotion/react";

// === Plus ===
export type Theme = "Line";
export interface PlusProps extends React.HTMLAttributes<HTMLDivElement> {
  theme?: Theme;
  unionBg?: string;
  children?: React.ReactNode;
}
const PlusCss = css`
  width: 100%;
  height: 100%;
  background: transparent;
`;
const plus_UnionCss = css`
  overflow: visible;
  width: 15px;
  height: 15px;
  fill: var(--black-white-white, #fff);
`;
function Plus(props: PlusProps) {
  const { theme = "Line", unionBg = "", children, ...restProps } = props;
  return (
    <svg
      css={PlusCss}
      {...restProps}
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
    >
      <g transform="translate(1.5, 1.5)">
        <path
          d="M8.25 0H6.75V6.75H0V8.25H6.75V15H8.25V8.25H15V6.75H8.25V0Z"
          fill="white"
        />
      </g>
    </svg>
  );
}


// === Primary ===
export type Size = "Large" | "Medium" | "Small";
export type State = "Default" | "Hover" | "Pressed" | "Disabled";
export interface PrimaryProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  state?: State;
  rightIcon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  children?: React.ReactNode;
}
const PrimaryCssSizeStyles = {
  Large: css({
    padding: "8px",
  }),
  Medium: css({
    padding: "7px 8px",
  }),
  Small: css({
    padding: "3px 4px",
  }),
};
const PrimaryCss = (size: Size) => [
  css`
    display: inline-flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    border-radius: 4px;
    background: var(--Danger-600, #f64c4c);
    &:disabled {
      background: var(--Danger-300, #ffccd2);
    }
    &:active {
      background: var(--Danger-700, #ec2d30);
    }
    &:hover {
      background: var(--Danger-500, #eb6f70);
    }
  `,
  PrimaryCssSizeStyles[size],
];
const MinWidthCssSizeStyles = {
  Large: css({
    width: "90px",
  }),
  Medium: css({
    width: "82px",
  }),
  Small: css({
    width: "54px",
  }),
};
const MinWidthCssStateStyles = {};
const MinWidthCss = (size: Size, state: State) => [
  css`
    overflow: visible;
    height: 1px;
  `,
  MinWidthCssSizeStyles[size],
  MinWidthCssStateStyles[state],
];
const TextCssSizeStyles = {
  Large: css({
    fontSize: "16px",
    lineHeight: "24px /* 150% */",
  }),
  Medium: css({
    fontSize: "14px",
    lineHeight: "22px /* 157.143% */",
  }),
  Small: css({
    fontSize: "12px",
    lineHeight: "18px /* 150% */",
  }),
};
const TextCssStateStyles = {};
const TextCss = (size: Size, state: State) => [
  css`
    color: var(--black-white-white, #fff);
    text-align: center;
    font-family: "PingFang SC";
    font-style: normal;
    font-weight: 500;
  `,
  TextCssSizeStyles[size],
  TextCssStateStyles[state],
];
const Plus_wrapperCssSizeStyles = {
  Large: css({
    width: "18px",
    height: "18px",
  }),
  Medium: css({
    width: "16px",
    height: "16px",
  }),
  Small: css({
    width: "14px",
    height: "14px",
  }),
};
const Plus_wrapperCssStateStyles = {};
const Plus_wrapperCss = (size: Size, state: State) => [
  css``,
  Plus_wrapperCssSizeStyles[size],
  Plus_wrapperCssStateStyles[state],
];
const UnionCssSizeStyles = {
  Large: css({
    width: "15px",
    height: "15px",
  }),
  Medium: css({
    width: "13.333px",
    height: "13.333px",
  }),
  Small: css({
    width: "11.667px",
    height: "11.667px",
  }),
};
const UnionCssStateStyles = {};
const UnionCss = (size: Size, state: State) => [
  css`
    overflow: visible;
    fill: var(--black-white-white, #fff);
  `,
  UnionCssSizeStyles[size],
  UnionCssStateStyles[state],
];
const Plus_wrapperCss_2SizeStyles = {
  Large: css({
    width: "18px",
    height: "18px",
  }),
  Medium: css({
    width: "16px",
    height: "16px",
  }),
  Small: css({
    width: "14px",
    height: "14px",
  }),
};
const Plus_wrapperCss_2StateStyles = {};
const Plus_wrapperCss_2 = (size: Size, state: State) => [
  css``,
  Plus_wrapperCss_2SizeStyles[size],
  Plus_wrapperCss_2StateStyles[state],
];
const UnionCss_2SizeStyles = {
  Large: css({
    width: "15px",
    height: "15px",
  }),
  Medium: css({
    width: "13.333px",
    height: "13.333px",
  }),
  Small: css({
    width: "11.667px",
    height: "11.667px",
  }),
};
const UnionCss_2StateStyles = {};
const UnionCss_2 = (size: Size, state: State) => [
  css`
    overflow: visible;
    fill: var(--black-white-white, #fff);
  `,
  UnionCss_2SizeStyles[size],
  UnionCss_2StateStyles[state],
];
export default function Primary(props: PrimaryProps) {
  const {
    size = "Large",
    state = "Default",
    leftIcon = null,
    rightIcon = null,
    children,
    ...restProps
  } = props;
  return (
    <button css={[PrimaryCss(size)]} {...restProps}>
      <div css={[MinWidthCss(size, state)]} />
      <span css={[TextCss(size, state)]}>Text</span>
      <span css={[Plus_wrapperCss(size, state)]}>
        {rightIcon}
        <svg
          css={[UnionCss(size, state)]}
          width={15}
          height={15}
          viewBox="0 0 15 15"
          fill="none"
        >
          <path
            d="M8.25 0H6.75V6.75H0V8.25H6.75V15H8.25V8.25H15V6.75H8.25V0Z"
            fill="white"
          />
        </svg>
      </span>
      <span css={[Plus_wrapperCss_2(size, state)]}>
        {leftIcon}
        <svg
          css={[UnionCss_2(size, state)]}
          width={15}
          height={15}
          viewBox="0 0 15 15"
          fill="none"
        >
          <path
            d="M8.25 0H6.75V6.75H0V8.25H6.75V15H8.25V8.25H15V6.75H8.25V0Z"
            fill="white"
          />
        </svg>
      </span>
      {children}
    </button>
  );
}
