import React from "react";

import { css } from "@emotion/react";

export interface FrameProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

const FrameCss = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 64px;
  align-self: stretch;
`;

const Row1Css = css`
  display: flex;
  align-items: flex-start;
  gap: 128px;
  align-self: stretch;
`;

const DarkgraysCss = css`
  display: flex;
  width: 264px;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
`;

const WhitelightgraysCss = css`
  display: flex;
  width: 265px;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
`;

const DarkCss = css`
  height: 40px;
  align-self: stretch;
  position: relative;
`;

const YellowbrightCss = css`
  display: flex;
  padding-right: 116px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const YellowCss = css`
  display: flex;
  padding-right: 163px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Yellowlight2Css = css`
  display: flex;
  padding-right: 114px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const OrangebrightCss = css`
  display: flex;
  padding-right: 109px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const OrangeCss = css`
  display: flex;
  padding-right: 155px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Orangelight2Css = css`
  display: flex;
  padding-right: 107px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const RedbrightCss = css`
  display: flex;
  padding-right: 134px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const RedCss = css`
  display: flex;
  padding-right: 180px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Reddark1Css = css`
  display: flex;
  padding-right: 133px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Redlight2Css = css`
  display: flex;
  padding-right: 132px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const PinkbrightCss = css`
  display: flex;
  padding-right: 131px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const PinkCss = css`
  display: flex;
  padding-right: 177px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Pinklight2Css = css`
  display: flex;
  padding-right: 129px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const PurpleCss = css`
  display: flex;
  padding-right: 162px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Purpledark1Css = css`
  display: flex;
  padding-right: 115px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Purplelight2Css = css`
  display: flex;
  padding-right: 113px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const BluebrightCss = css`
  display: flex;
  padding-right: 130px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Bluelight2Css = css`
  display: flex;
  padding-right: 128px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const CyanbrightCss = css`
  display: flex;
  padding-right: 126px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const CyanCss = css`
  display: flex;
  padding-right: 172px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Cyandark1Css = css`
  display: flex;
  padding-right: 125px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Cyanlight2Css = css`
  display: flex;
  padding-right: 123px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const TealCss = css`
  display: flex;
  padding-right: 179px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const GreenbrightCss = css`
  display: flex;
  padding-right: 119px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const GreenCss = css`
  display: flex;
  padding-right: 165px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const Greendark1Css = css`
  display: flex;
  padding-right: 118px;
  align-items: center;
  gap: 16px;
  align-self: stretch;
  position: relative;
`;

const SwatchCss = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--Dark, #333);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const DarkCss_2 = css`
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 15px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px /* 133.333% */;
  position: absolute;
  left: 56px;
  top: 10px;
`;

const defaulttextCss = css`
  color: var(--Light, #757575);
  text-align: right;
  font-family: "SF Pro Text";
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: 16px /* 123.077% */;
  position: absolute;
  left: 194px;
  top: 12px;
`;

const SwatchCss_2 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--Light, #757575);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const lighttextCss = css`
  color: var(--Light, #757575);
  text-align: right;
  font-family: "SF Pro Text";
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: 16px /* 123.077% */;
  position: absolute;
  left: 210px;
  top: 12px;
`;

const SwatchCss_3 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: var(--White, #fff);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const bgCss = css`
  color: var(--Light, #757575);
  text-align: right;
  font-family: "SF Pro Text";
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: 16px /* 123.077% */;
  position: absolute;
  left: 249px;
  top: 12px;
`;

const SwatchCss_4 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: var(--Light-gray-1, #fafafa);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const bgCss_2 = css`
  color: var(--Light, #757575);
  text-align: right;
  font-family: "SF Pro Text";
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: 16px /* 123.077% */;
  position: absolute;
  left: 248px;
  top: 12px;
`;

const SwatchCss_5 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: var(--Light-gray-2, #f2f2f2);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const borderbgCss = css`
  color: var(--Light, #757575);
  text-align: right;
  font-family: "SF Pro Text";
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: 16px /* 123.077% */;
  position: absolute;
  left: 190px;
  top: 12px;
`;

const SwatchCss_6 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: var(--Light-gray-3, #e8e8e8);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const Lightgray3Css = css`
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 15px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px /* 133.333% */;
  position: absolute;
  left: 55px;
  top: 10px;
`;

const SwatchCss_7 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: var(--Light-gray-4, #e0e0e0);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const borderbgCss_2 = css`
  color: var(--Light, #757575);
  text-align: right;
  font-family: "SF Pro Text";
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: 16px /* 123.077% */;
  position: absolute;
  left: 191px;
  top: 12px;
`;

const SwatchCss_8 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--yellowBright, #fcb400);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_9 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--yellow, #e08d00);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_10 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--yellowDark1, #b87503);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_11 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--yellowLight1, #ffd66e);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_12 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--yellowLight2, #ffeab6);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_13 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--orangeBright, #ff6f2c);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_14 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--orange, #f7653b);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_15 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--orangeDark1, #d74d26);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_16 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--orangeLight1, #ffa981);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_17 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--orangeLight2, #fee2d5);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_18 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--redBright, #f82b60);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_19 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--red, #ef3061);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_20 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--redDark1, #ba1e45);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_21 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--redLight1, #ff9eb7);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_22 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--redLight2, #ffdce5);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_23 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--pinkBright, #ff08c2);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const PinkbrightCss_2 = css`
  width: 77px;
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 15px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px /* 133.333% */;
  position: absolute;
  left: 56px;
  top: 10px;
`;

const SwatchCss_24 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--pink, #e929ba);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const PinkCss_2 = css`
  width: 31px;
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 15px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px /* 133.333% */;
  position: absolute;
  left: 56px;
  top: 10px;
`;

const SwatchCss_25 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--pinkDark1, #b2158b);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_26 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--pinkLight1, #f99de2);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_27 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--pinkLight2, #ffdaf6);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const Pinklight2Css_2 = css`
  width: 79px;
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 15px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px /* 133.333% */;
  position: absolute;
  left: 56px;
  top: 10px;
`;

const SwatchCss_28 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--purpleBright, #8b46ff);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const PurplebrightCss = css`
  width: 92px;
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 15px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px /* 133.333% */;
  position: absolute;
  left: 56px;
  top: 10px;
`;

const SwatchCss_29 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--purple, #7c39ed);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const PurpleCss_2 = css`
  width: 46px;
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 15px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px /* 133.333% */;
  position: absolute;
  left: 56px;
  top: 10px;
`;

const SwatchCss_30 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--purpleDark1, #6b1cb0);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const Purpledark1Css_2 = css`
  width: 93px;
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 15px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px /* 133.333% */;
  position: absolute;
  left: 56px;
  top: 10px;
`;

const SwatchCss_31 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--purpleLight1, #cdb0ff);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_32 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--purpleLight2, #ede3fe);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const Purplelight2Css_2 = css`
  width: 95px;
  color: var(--Dark, #333);
  font-family: "SF Pro Text";
  font-size: 15px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px /* 133.333% */;
  position: absolute;
  left: 56px;
  top: 10px;
`;

const SwatchCss_33 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--blueBright, #2d7ff9);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_34 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--blue, #1283da);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_35 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--blueDark1, #2750ae);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_36 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--blueLight1, #9cc7ff);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_37 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--blueLight2, #cfdfff);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_38 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--cyanBright, #18bfff);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_39 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--cyan, #01a9db);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_40 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--cyanDark1, #0b76b7);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_41 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--cyanLight1, #77d1f3);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_42 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--cyanLight2, #d0f0fd);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_43 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--tealBright, #20d9d2);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_44 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--teal, #02aaa4);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_45 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--tealDark1, #06a09b);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_46 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--tealLight1, #72ddc3);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_47 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--tealLight2, #c2f5e9);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_48 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--greenBright, #20c933);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_49 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--green, #11af22);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_50 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--greenDark1, #338a17);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_51 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--greenLight1, #93e088);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const SwatchCss_52 = css`
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: var(--greenLight2, #d1f7c4);
  position: absolute;
  left: 0px;
  top: 0px;
`;

export default function Frame(props: FrameProps) {
  const { children, ...restProps } = props;
  return (
    <div css={FrameCss} {...restProps}>
      <div css={Row1Css}>
        <div css={DarkgraysCss}>
          <div css={DarkCss}>
            <div css={SwatchCss} />
            <span css={DarkCss_2}>Dark</span>
            <span css={defaulttextCss}>default text</span>
          </div>
          <div css={DarkCss}>
            <div css={SwatchCss_2} />
            <span css={DarkCss_2}>Light</span>
            <span css={lighttextCss}>light text</span>
          </div>
        </div>
        <div css={WhitelightgraysCss}>
          <div css={DarkCss}>
            <div css={SwatchCss_3} />
            <span css={DarkCss_2}>White</span>
            <span css={bgCss}>bg</span>
          </div>
          <div css={DarkCss}>
            <div css={SwatchCss_4} />
            <span css={DarkCss_2}>Light gray 1</span>
            <span css={bgCss_2}>bg</span>
          </div>
          <div css={DarkCss}>
            <div css={SwatchCss_5} />
            <span css={DarkCss_2}>Light gray 2</span>
            <span css={borderbgCss}>border & bg</span>
          </div>
          <div css={DarkCss}>
            <div css={SwatchCss_6} />
            <span css={Lightgray3Css}>Light gray 3</span>
            <span css={borderbgCss}>border & bg</span>
          </div>
          <div css={DarkCss}>
            <div css={SwatchCss_7} />
            <span css={DarkCss_2}>Light gray 4</span>
            <span css={borderbgCss_2}>border & bg</span>
          </div>
        </div>
      </div>
      <div css={Row1Css}>
        <div css={DarkgraysCss}>
          <div css={YellowbrightCss}>
            <div css={SwatchCss_8} />
            <span css={DarkCss_2}>Yellow bright</span>
          </div>
          <div css={YellowCss}>
            <div css={SwatchCss_9} />
            <span css={DarkCss_2}>Yellow</span>
          </div>
          <div css={YellowbrightCss}>
            <div css={SwatchCss_10} />
            <span css={DarkCss_2}>Yellow dark 1</span>
          </div>
          <div css={YellowbrightCss}>
            <div css={SwatchCss_11} />
            <span css={DarkCss_2}>Yellow light 1</span>
          </div>
          <div css={Yellowlight2Css}>
            <div css={SwatchCss_12} />
            <span css={DarkCss_2}>Yellow light 2</span>
          </div>
        </div>
        <div css={DarkgraysCss}>
          <div css={OrangebrightCss}>
            <div css={SwatchCss_13} />
            <span css={DarkCss_2}>Orange bright</span>
          </div>
          <div css={OrangeCss}>
            <div css={SwatchCss_14} />
            <span css={DarkCss_2}>Orange</span>
          </div>
          <div css={OrangebrightCss}>
            <div css={SwatchCss_15} />
            <span css={DarkCss_2}>Orange dark 1</span>
          </div>
          <div css={OrangebrightCss}>
            <div css={SwatchCss_16} />
            <span css={DarkCss_2}>Orange light 1</span>
          </div>
          <div css={Orangelight2Css}>
            <div css={SwatchCss_17} />
            <span css={DarkCss_2}>Orange light 2</span>
          </div>
        </div>
        <div css={DarkgraysCss}>
          <div css={RedbrightCss}>
            <div css={SwatchCss_18} />
            <span css={DarkCss_2}>Red bright</span>
          </div>
          <div css={RedCss}>
            <div css={SwatchCss_19} />
            <span css={DarkCss_2}>Red</span>
          </div>
          <div css={Reddark1Css}>
            <div css={SwatchCss_20} />
            <span css={DarkCss_2}>Red dark 1</span>
          </div>
          <div css={RedbrightCss}>
            <div css={SwatchCss_21} />
            <span css={DarkCss_2}>Red light 1</span>
          </div>
          <div css={Redlight2Css}>
            <div css={SwatchCss_22} />
            <span css={DarkCss_2}>Red light 2</span>
          </div>
        </div>
      </div>
      <div css={Row1Css}>
        <div css={DarkgraysCss}>
          <div css={PinkbrightCss}>
            <div css={SwatchCss_23} />
            <span css={PinkbrightCss_2}>Pink bright</span>
          </div>
          <div css={PinkCss}>
            <div css={SwatchCss_24} />
            <span css={PinkCss_2}>Pink</span>
          </div>
          <div css={PinkbrightCss}>
            <div css={SwatchCss_25} />
            <span css={PinkbrightCss_2}>Pink dark 1</span>
          </div>
          <div css={PinkbrightCss}>
            <div css={SwatchCss_26} />
            <span css={PinkbrightCss_2}>Pink light 1</span>
          </div>
          <div css={Pinklight2Css}>
            <div css={SwatchCss_27} />
            <span css={Pinklight2Css_2}>Pink light 2</span>
          </div>
        </div>
        <div css={DarkgraysCss}>
          <div css={YellowbrightCss}>
            <div css={SwatchCss_28} />
            <span css={PurplebrightCss}>Purple bright</span>
          </div>
          <div css={PurpleCss}>
            <div css={SwatchCss_29} />
            <span css={PurpleCss_2}>Purple</span>
          </div>
          <div css={Purpledark1Css}>
            <div css={SwatchCss_30} />
            <span css={Purpledark1Css_2}>Purple dark 1</span>
          </div>
          <div css={Purpledark1Css}>
            <div css={SwatchCss_31} />
            <span css={Purpledark1Css_2}>Purple light 1</span>
          </div>
          <div css={Purplelight2Css}>
            <div css={SwatchCss_32} />
            <span css={Purplelight2Css_2}>Purple light 2</span>
          </div>
        </div>
        <div css={DarkgraysCss}>
          <div css={BluebrightCss}>
            <div css={SwatchCss_33} />
            <span css={DarkCss_2}>Blue bright</span>
          </div>
          <div css={PinkCss}>
            <div css={SwatchCss_34} />
            <span css={DarkCss_2}>Blue</span>
          </div>
          <div css={BluebrightCss}>
            <div css={SwatchCss_35} />
            <span css={DarkCss_2}>Blue dark 1</span>
          </div>
          <div css={BluebrightCss}>
            <div css={SwatchCss_36} />
            <span css={DarkCss_2}>Blue light 1</span>
          </div>
          <div css={Bluelight2Css}>
            <div css={SwatchCss_37} />
            <span css={DarkCss_2}>Blue light 2</span>
          </div>
        </div>
      </div>
      <div css={Row1Css}>
        <div css={DarkgraysCss}>
          <div css={CyanbrightCss}>
            <div css={SwatchCss_38} />
            <span css={DarkCss_2}>Cyan bright</span>
          </div>
          <div css={CyanCss}>
            <div css={SwatchCss_39} />
            <span css={DarkCss_2}>Cyan</span>
          </div>
          <div css={Cyandark1Css}>
            <div css={SwatchCss_40} />
            <span css={DarkCss_2}>Cyan dark 1</span>
          </div>
          <div css={Cyandark1Css}>
            <div css={SwatchCss_41} />
            <span css={DarkCss_2}>Cyan light 1</span>
          </div>
          <div css={Cyanlight2Css}>
            <div css={SwatchCss_42} />
            <span css={DarkCss_2}>Cyan light 2</span>
          </div>
        </div>
        <div css={DarkgraysCss}>
          <div css={Redlight2Css}>
            <div css={SwatchCss_43} />
            <span css={DarkCss_2}>Teal bright</span>
          </div>
          <div css={TealCss}>
            <div css={SwatchCss_44} />
            <span css={DarkCss_2}>Teal</span>
          </div>
          <div css={Redlight2Css}>
            <div css={SwatchCss_45} />
            <span css={DarkCss_2}>Teal dark 1</span>
          </div>
          <div css={Redlight2Css}>
            <div css={SwatchCss_46} />
            <span css={DarkCss_2}>Teal light 1</span>
          </div>
          <div css={BluebrightCss}>
            <div css={SwatchCss_47} />
            <span css={DarkCss_2}>Teal light 2</span>
          </div>
        </div>
        <div css={DarkgraysCss}>
          <div css={GreenbrightCss}>
            <div css={SwatchCss_48} />
            <span css={DarkCss_2}>Green bright</span>
          </div>
          <div css={GreenCss}>
            <div css={SwatchCss_49} />
            <span css={DarkCss_2}>Green</span>
          </div>
          <div css={Greendark1Css}>
            <div css={SwatchCss_50} />
            <span css={DarkCss_2}>Green dark 1</span>
          </div>
          <div css={Greendark1Css}>
            <div css={SwatchCss_51} />
            <span css={DarkCss_2}>Green light 1</span>
          </div>
          <div css={YellowbrightCss}>
            <div css={SwatchCss_52} />
            <span css={DarkCss_2}>Green light 2</span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
