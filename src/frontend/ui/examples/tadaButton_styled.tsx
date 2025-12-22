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
const MonoCss_I2583420825078017 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  ${""}
`;
const MonoCss_I2583462325078017 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  ${""}
`;
const MaskByDisabled_I258342082507801725517768 = {
  False: { alignSelf: "stretch" },
};
const MaskBySize_I258342082507801725517768 = { Small: { height: "16px" } };
const MaskCss_I258342082507801725517768 = (
  $disabled: Disabled,
  $size: Size
) => css`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  ${MaskByDisabled_I258342082507801725517768[$disabled]}
  ${MaskBySize_I258342082507801725517768[$size]}
`;
const ColorBySize_I258342082507801725517770 = {
  Large: {
    width: "24px",
    height: "24px",
    background: "var(--Static-Black, #000)",
  },
  Medium: {
    width: "20px",
    height: "20px",
    background: "var(--Label-Normal, #000)",
  },
  Small: {
    width: "16px",
    height: "16px",
    background: "var(--Label-Normal, #000)",
  },
};
const ColorByDisabled_I258342082507801725517770 = {
  False: { left: "0", top: "0" },
};
const ColorCss_I258342082507801725517770 = (
  $size: Size,
  $disabled: Disabled
) => css`
  position: absolute;
  ${ColorBySize_I258342082507801725517770[$size]}
  ${ColorByDisabled_I258342082507801725517770[$disabled]}
`;
const MaskCss_I258346232507801725517768 = css`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  align-self: stretch;
  ${""}
`;
const ColorCss_I258346232507801725517770 = css`
  width: 24px;
  height: 24px;
  position: absolute;
  background: var(--Static-Black, #000);
  ${""}
`;
const NormalBlankBySize_I258342082507801725517769 = {
  Large: { height: "24px" },
  Medium: { height: "20px" },
  Small: { flex: "1 0 0" },
};
const NormalBlankCss_I258342082507801725517769 = ($size: Size) => css`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  ${NormalBlankBySize_I258342082507801725517769[$size]}
`;
const NormalBlankCss_I258346232507801725517769 = css`
  display: flex;
  height: 24px;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  ${""}
`;
const ShapeBySize_I258342082507801725517769892940 = {
  Large: { width: "24px", height: "24px", padding: "3px" },
  Medium: { width: "20px", height: "20px", padding: "2.5px" },
  Small: { width: "16px", height: "16px", padding: "2px" },
};
const ShapeCss_I258342082507801725517769892940 = ($size: Size) => css`
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  ${ShapeBySize_I258342082507801725517769892940[$size]}
`;
const RatioVerticalCss_I25834208250780172551776912154933 = css`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
  ${""}
`;
const ShapeCss_I258346232507801725517769892940 = css`
  display: flex;
  width: 24px;
  height: 24px;
  padding: 3px;
  justify-content: center;
  align-items: center;
  position: absolute;
  ${""}
`;
const RatioVerticalCss_I25834623250780172551776912154933 = css`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
  ${""}
`;
const StrokeBySize_I258342082507801725517769892941 = {
  Large: { width: "18px", height: "18px" },
  Medium: { width: "15px", height: "15px" },
  Small: { width: "12px", height: "12px" },
};
const StrokeCss_I258342082507801725517769892941 = ($size: Size) => css`
  flex-shrink: 0;
  fill: var(--Label-Normal, #000);
  ${StrokeBySize_I258342082507801725517769892941[$size]}
`;
const RatioCss_I2583420825078017255177691215493312154928 = css`
  display: flex;
  transform: rotate(-36.87deg);
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
  ${""}
`;
const StrokeCss_I258346232507801725517769892941 = css`
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  fill: var(--Label-Normal, #000);
  ${""}
`;
const RatioCss_I2583462325078017255177691215493312154928 = css`
  display: flex;
  transform: rotate(-36.87deg);
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
  ${""}
`;
const RatioCss_I2583420825078017255177691215493312154929 = css`
  display: flex;
  width: 0;
  transform: rotate(-30deg);
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
  ${""}
`;
const RatioCss_I2583462325078017255177691215493312154929 = css`
  display: flex;
  width: 0;
  transform: rotate(-30deg);
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
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
