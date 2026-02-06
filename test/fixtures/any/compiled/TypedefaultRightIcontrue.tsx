import React from "react";
import { css } from "@emotion/react";

// === NormalResponsive ===
export type Size = "Normal" | "Large";
export interface NormalResponsiveProps
  extends React.HTMLAttributes<HTMLDivElement> {
  size?: Size;
  unionBg?: string;
  path3Bg?: string;
  path2CopyBg?: string;
  strokeBg?: string;
  children?: React.ReactNode;
}
const NormalResponsiveCss = css`
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  height: 100%;
  background: transparent;
`;
function NormalResponsive(props: NormalResponsiveProps) {
  const {
    size = "Normal",
    unionBg = "",
    path3Bg = "",
    path2CopyBg = "",
    strokeBg = "",
    children,
    ...restProps
  } = props;
  return size === "Normal" ? (
    <svg
      css={NormalResponsiveCss}
      {...restProps}
      width={24.000070571899414}
      height={24}
      viewBox="0 0 24.000070571899414 24"
      fill="none"
    >
      <g transform="translate(2.585693359375, 4.293701171875)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M0 7.79688L7.79688 0L9.21094 1.41406L3.82776 6.79724H19.4144V8.79724H3.82849L9.21094 14.1797L7.79688 15.5938L0 7.79688Z"
          fill="black"
        />
      </g>
    </svg>
  ) : (
    <svg
      css={NormalResponsiveCss}
      {...restProps}
      width={32}
      height={32}
      viewBox="0 0 32 32"
      fill="none"
    >
      <g transform="translate(4, 4)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M6.66665 2.66667C6.30639 2.66667 5.95922 2.71396 5.6301 2.80194L4.34199 3.14625L3.65336 0.570037L4.94146 0.225719C5.4932 0.0782371 6.07181 0 6.66665 0H9.77775V2.66667H6.66665ZM14.2222 0H17.3333C17.9281 0 18.5067 0.0782371 19.0585 0.225719L20.3466 0.570037L19.6579 3.14625L18.3698 2.80194C18.0407 2.71396 17.6935 2.66667 17.3333 2.66667H14.2222V0ZM3.14624 4.34201L2.80193 5.63011C2.71395 5.95924 2.66666 6.30641 2.66666 6.66667V9.77778H0V6.66667C0 6.07183 0.0782369 5.49321 0.225719 4.94148L0.570036 3.65337L3.14624 4.34201ZM23.4299 3.65337L23.7742 4.94148C23.9217 5.49322 23.9999 6.07183 23.9999 6.66667V9.77778H21.3333V6.66667C21.3333 6.30641 21.286 5.95924 21.198 5.63012L20.8537 4.34201L23.4299 3.65337ZM2.66666 14.2222V17.3333C2.66666 17.6936 2.71395 18.0408 2.80193 18.3699L3.14624 19.658L0.570036 20.3466L0.225718 19.0585C0.0782368 18.5068 0 17.9282 0 17.3333V14.2222H2.66666ZM23.9999 14.2222V17.3333C23.9999 17.9282 23.9217 18.5068 23.7742 19.0585L23.4299 20.3466L20.8537 19.658L21.198 18.3699C21.286 18.0408 21.3333 17.6936 21.3333 17.3333V14.2222H23.9999ZM4.34199 20.8537L5.6301 21.1981C5.95922 21.286 6.30639 21.3333 6.66665 21.3333H9.77775V24H6.66665C6.07181 24 5.4932 23.9218 4.94146 23.7743L3.65336 23.43L4.34199 20.8537ZM20.3466 23.43L19.0585 23.7743C18.5067 23.9218 17.9281 24 17.3333 24H14.2222V21.3333H17.3333C17.6935 21.3333 18.0407 21.286 18.3698 21.1981L19.6579 20.8537L20.3466 23.43Z"
          fill="black"
        />
      </g>
    </svg>
  );
}


// === Normalblank ===
export type CustomName = "Blank";
export interface NormalblankProps extends React.HTMLAttributes<HTMLDivElement> {
  customName?: CustomName;
  strokeBg?: string;
  children?: React.ReactNode;
}
const NormalblankCss = css`
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: transparent;
  position: relative;
`;
function Normalblank(props: NormalblankProps) {
  const { customName = "Blank", strokeBg = "", children, ...restProps } = props;
  return (
    <div css={NormalblankCss} {...restProps}>
      {children}
    </div>
  );
}


// === Ratiovertical ===
export type Ratio = "1:1";
export interface RatioverticalProps
  extends React.HTMLAttributes<HTMLDivElement> {
  ratio?: Ratio;
  children?: React.ReactNode;
}
const RatioverticalCss = css`
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: transparent;
`;
const RatioCss = css`
  display: flex;
  transform: rotate(-36.87deg);
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
`;
const RatioCss_2 = css`
  display: flex;
  width: 0;
  transform: rotate(-30deg);
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
`;
function Ratiovertical(props: RatioverticalProps) {
  const { ratio = "1:1", children, ...restProps } = props;
  return (
    <div css={RatioverticalCss} {...restProps}>
      <div css={RatioCss}>
        <div css={RatioCss_2} />
      </div>
      {children}
    </div>
  );
}


// === NormalarrowBack ===

export interface NormalarrowBackProps
  extends React.HTMLAttributes<HTMLDivElement> {
  customName?: CustomName;
  unionBg?: string;
  path3Bg?: string;
  path2CopyBg?: string;
  children?: React.ReactNode;
}
function NormalarrowBack(props: NormalarrowBackProps) {
  const {
    customName = "Blank",
    unionBg = "",
    path3Bg = "",
    path2CopyBg = "",
    children,
    ...restProps
  } = props;
  return (
    <div css={NormalblankCss} {...restProps}>
      {children}
    </div>
  );
}


// === TypedefaultRightIcontrue ===
export interface TypedefaultRightIcontrueProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}
const TypedefaultRightIcontrueCss = css`
  display: flex;
  width: 375px;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
`;
const SubHeaderCss = css`
  display: flex;
  height: 64px;
  padding: 0 24px;
  align-items: center;
  gap: 271px;
  align-self: stretch;
  background: var(--Static-White, #fff);
  position: relative;
`;
const _NormalResponsiveCss = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;
const TextCss = css`
  position: absolute;
  left: 167px;
  top: 22px;
  color: var(--Semantic-Static-Black, var(--Static-Black, #000));
  text-align: center;
  font-feature-settings:
    "liga" off,
    "clig" off;
  font-family: Pretendard;
  font-size: 16px;
  font-style: normal;
  font-weight: 700;
  line-height: 20px /* 125% */;
`;
export default function TypedefaultRightIcontrue(
  props: TypedefaultRightIcontrueProps
) {
  const { children, ...restProps } = props;
  return (
    <div css={TypedefaultRightIcontrueCss} {...restProps}>
      <div css={SubHeaderCss}>
        <NormalResponsive size="normal" />
        <span css={TextCss}>Text </span>
        <NormalResponsive size="large" />
      </div>
      {children}
    </div>
  );
}
