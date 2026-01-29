import React from "react";
import { css } from "@emotion/react";

// === NormalResponsive ===
export interface NormalResponsiveProps
  extends React.HTMLAttributes<HTMLDivElement> {
  size?: string;
  children?: React.ReactNode;
}
const NormalResponsiveCss = css({
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  width: "100%",
  height: "100%",
  background: "transparent",
});
const normalResponsive_NormalArrowBackCss = css({
  display: "flex",
  height: "24px",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
});
const normalResponsive_Arrow_BackCss = css({
  width: "24px",
  height: "24px",
  position: "absolute",
});
const normalResponsive_UnionCss = css({
  width: "19.414px",
  height: "15.594px",
  fill: "var(--Static-Black, #000)",
  position: "absolute",
  left: "3px",
  top: "4px",
});
const normalResponsive_Path3Css = css({
  width: "14.18px",
  height: "7.09px",
  strokeWidth: "2px",
  stroke: "var(--Static-Black, #000)",
});
const normalResponsive_Path2CopyCss = css({
  width: "18px",
  height: "1px",
  strokeWidth: "2px",
  stroke: "var(--Static-Black, #000)",
});
const normalResponsive_RatioVerticalCss = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const normalResponsive_RatioCss = css({
  display: "flex",
  transform: "rotate(-36.87deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const normalResponsive_RatioCss_2 = css({
  display: "flex",
  width: "0",
  transform: "rotate(-30deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
function NormalResponsive(props: NormalResponsiveProps) {
  const { size = "Normal", children, ...restProps } = props;
  return (
    <div css={NormalResponsiveCss} {...restProps}>
      <NormalArrowBack customName="blank" />
      {children}
    </div>
  );
}


// === Normalblank ===
export interface NormalblankProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  children?: React.ReactNode;
}
const NormalblankCss = css({
  display: "inline-flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  width: "100%",
  height: "100%",
  background: "transparent",
  position: "relative",
});
const normalblank_NormalBlankCss = css({
  width: "32px",
  height: "32px",
  position: "absolute",
});
const normalblank_StrokeCss = css({
  width: "24px",
  height: "24px",
  fill: "var(--Static-Black, #000)",
  position: "absolute",
  left: "4px",
  top: "4px",
});
const normalblank_RatioVerticalCss = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const normalblank_RatioCss = css({
  display: "flex",
  transform: "rotate(-36.87deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const normalblank_RatioCss_2 = css({
  display: "flex",
  width: "0",
  transform: "rotate(-30deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
function Normalblank(props: NormalblankProps) {
  const { name = "Blank", children, ...restProps } = props;
  return (
    <div css={NormalblankCss} {...restProps}>
      <div css={normalblank_NormalBlankCss}>
        <svg
          css={normalblank_StrokeCss}
          width={24}
          height={24}
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M6.66665 2.66667C6.30639 2.66667 5.95922 2.71396 5.6301 2.80194L4.34199 3.14625L3.65336 0.570037L4.94146 0.225719C5.4932 0.0782371 6.07181 0 6.66665 0H9.77775V2.66667H6.66665ZM14.2222 0H17.3333C17.9281 0 18.5067 0.0782371 19.0585 0.225719L20.3466 0.570037L19.6579 3.14625L18.3698 2.80194C18.0407 2.71396 17.6935 2.66667 17.3333 2.66667H14.2222V0ZM3.14624 4.34201L2.80193 5.63011C2.71395 5.95924 2.66666 6.30641 2.66666 6.66667V9.77778H0V6.66667C0 6.07183 0.0782369 5.49321 0.225719 4.94148L0.570036 3.65337L3.14624 4.34201ZM23.4299 3.65337L23.7742 4.94148C23.9217 5.49322 23.9999 6.07183 23.9999 6.66667V9.77778H21.3333V6.66667C21.3333 6.30641 21.286 5.95924 21.198 5.63012L20.8537 4.34201L23.4299 3.65337ZM2.66666 14.2222V17.3333C2.66666 17.6936 2.71395 18.0408 2.80193 18.3699L3.14624 19.658L0.570036 20.3466L0.225718 19.0585C0.0782368 18.5068 0 17.9282 0 17.3333V14.2222H2.66666ZM23.9999 14.2222V17.3333C23.9999 17.9282 23.9217 18.5068 23.7742 19.0585L23.4299 20.3466L20.8537 19.658L21.198 18.3699C21.286 18.0408 21.3333 17.6936 21.3333 17.3333V14.2222H23.9999ZM4.34199 20.8537L5.6301 21.1981C5.95922 21.286 6.30639 21.3333 6.66665 21.3333H9.77775V24H6.66665C6.07181 24 5.4932 23.9218 4.94146 23.7743L3.65336 23.43L4.34199 20.8537ZM20.3466 23.43L19.0585 23.7743C18.5067 23.9218 17.9281 24 17.3333 24H14.2222V21.3333H17.3333C17.6935 21.3333 18.0407 21.286 18.3698 21.1981L19.6579 20.8537L20.3466 23.43Z"
            fill="black"
          />
        </svg>
      </div>
      <RatioVertical ratio="1:1" />
      {children}
    </div>
  );
}


// === Ratiovertical ===
export interface RatioverticalProps
  extends React.HTMLAttributes<HTMLDivElement> {
  ratio?: string;
  children?: React.ReactNode;
}
const RatioverticalCss = css({
  display: "inline-flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  width: "100%",
  height: "100%",
  background: "transparent",
});
const ratiovertical_RatioCss = css({
  display: "flex",
  transform: "rotate(-36.87deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const ratiovertical_RatioCss_2 = css({
  display: "flex",
  width: "0",
  transform: "rotate(-30deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
function Ratiovertical(props: RatioverticalProps) {
  const { ratio = "1:1", children, ...restProps } = props;
  return (
    <div css={RatioverticalCss} {...restProps}>
      <div css={ratiovertical_RatioCss}>
        <div css={ratiovertical_RatioCss_2} />
      </div>
      {children}
    </div>
  );
}


// === NormalarrowBack ===
export interface NormalarrowBackProps
  extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  children?: React.ReactNode;
}
const NormalarrowBackCss = css({
  display: "inline-flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  width: "100%",
  height: "100%",
  background: "transparent",
  position: "relative",
});
const normalarrowBack_Arrow_BackCss = css({
  width: "24px",
  height: "24px",
  position: "absolute",
});
const normalarrowBack_UnionCss = css({
  width: "19.414px",
  height: "15.594px",
  fill: "var(--Static-Black, #000)",
  position: "absolute",
  left: "3px",
  top: "4px",
});
const normalarrowBack_Path3Css = css({
  width: "14.18px",
  height: "7.09px",
  strokeWidth: "2px",
  stroke: "var(--Static-Black, #000)",
});
const normalarrowBack_Path2CopyCss = css({
  width: "18px",
  height: "1px",
  strokeWidth: "2px",
  stroke: "var(--Static-Black, #000)",
});
const normalarrowBack_RatioVerticalCss = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const normalarrowBack_RatioCss = css({
  display: "flex",
  transform: "rotate(-36.87deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const normalarrowBack_RatioCss_2 = css({
  display: "flex",
  width: "0",
  transform: "rotate(-30deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
function NormalarrowBack(props: NormalarrowBackProps) {
  const { name = "Blank", children, ...restProps } = props;
  return (
    <div css={NormalarrowBackCss} {...restProps}>
      <div css={normalarrowBack_Arrow_BackCss}>
        <svg
          css={normalarrowBack_UnionCss}
          width={20}
          height={16}
          viewBox="0 0 20 16"
          fill="none"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M0 7.79688L7.79688 0L9.21094 1.41406L3.82776 6.79724H19.4144V8.79724H3.82849L9.21094 14.1797L7.79688 15.5938L0 7.79688Z"
            fill="black"
          />
        </svg>
      </div>
      <RatioVertical ratio="1:1" />
      {children}
    </div>
  );
}


// === TypedefaultRightIcontrue ===
export interface TypedefaultRightIcontrueProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}
const TypedefaultRightIcontrueCss = css({
  display: "flex",
  width: "375px",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "8px",
});
const SubHeaderCss = css({
  display: "flex",
  height: "64px",
  padding: "0 24px",
  alignItems: "center",
  gap: "271px",
  alignSelf: "stretch",
  background: "var(--Static-White, #FFF)",
});
const _NormalResponsiveCss = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
});
const NormalArrowBackCss = css({
  display: "flex",
  height: "24px",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
});
const Arrow_BackCss = css({
  width: "24px",
  height: "24px",
  position: "absolute",
});
const UnionCss = css({
  width: "19.414px",
  height: "15.594px",
  fill: "var(--Static-Black, #000)",
  position: "absolute",
  left: "3px",
  top: "4px",
});
const Path3Css = css({
  width: "14.18px",
  height: "7.09px",
  strokeWidth: "2px",
  stroke: "var(--Static-Black, #000)",
});
const Path2CopyCss = css({
  width: "18px",
  height: "1px",
  strokeWidth: "2px",
  stroke: "var(--Static-Black, #000)",
});
const RatioVerticalCss = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const RatioCss = css({
  display: "flex",
  transform: "rotate(-36.87deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const RatioCss_2 = css({
  display: "flex",
  width: "0",
  transform: "rotate(-30deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const TextCss = css({
  position: "absolute",
  left: "167px",
  top: "22px",
  color: "var(--Semantic-Static-Black, var(--Static-Black, #000))",
  textAlign: "center",
  fontFeatureSettings: "'liga' off, 'clig' off",
  fontFamily: "Pretendard",
  fontSize: "16px",
  fontStyle: "normal",
  fontWeight: "700",
  lineHeight: "20px /* 125% */",
});
const _NormalResponsiveCss_2 = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
});
const NormalBlankCss = css({
  display: "flex",
  width: "32px",
  height: "32px",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
});
const NormalBlankCss_2 = css({
  width: "32px",
  height: "32px",
  position: "absolute",
});
const StrokeCss = css({
  width: "24px",
  height: "24px",
  fill: "var(--Static-Black, #000)",
  position: "absolute",
  left: "4px",
  top: "4px",
});
const RatioVerticalCss_2 = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const RatioCss_3 = css({
  display: "flex",
  transform: "rotate(-36.87deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
const RatioCss_4 = css({
  display: "flex",
  width: "0",
  transform: "rotate(-30deg)",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  flex: "1 0 0",
});
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
