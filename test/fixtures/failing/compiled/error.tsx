import React from "react";

import { css } from "@emotion/react";


// === _Label ===
export interface _LabelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  titleBg?: string;
  titleText?: string | React.ReactNode;
}

const _LabelCss = css`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  background: transparent;`;

const _Label_TitleCss = css`
  color: var(--Semantic-Static-Black, var(--Static-Black, #000));
  font-feature-settings: 'liga' off, 'clig' off;
  font-family: "Spline Sans Mono";
  font-size: 9px;
  font-style: normal;
  font-weight: 400;
  line-height: 12px /* 133.333% */;`;

function _Label(props: _LabelProps) {
  const { titleBg, titleText, children, ...restProps } = props;
  return (
    <div data-figma-id="137:858" css={_LabelCss} {...restProps}>
      <span
        data-figma-id="I138:322;137:857"
        css={_Label_TitleCss}
        style={{ color: titleBg }}
      >
        {titleText ?? "Normal"}
      </span>
      {children}
    </div>
  );
}


// === Label ===
export interface LabelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

const LabelCss = css`
  display: inline-flex;
  align-items: center;
  gap: 24px;`;

const TitleCss = css`
  color: var(--Semantic-Static-Black, var(--Static-Black, #000));
  font-feature-settings: 'liga' off, 'clig' off;
  font-family: Pretendard;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
  line-height: 16px /* 133.333% */;`;

const Frame960Css = css`
  display: flex;
  align-items: center;
  gap: 8px;`;

const labelCss = css`
  display: flex;
  padding: 2px 4px 1px 4px;
  justify-content: center;
  align-items: center;
  gap: 8px;
  border-radius: 2px;
  background: var(--Background-Alternative, #D6D6D6);`;

export default function Label(props: LabelProps) {
  const { children, ...restProps } = props;
  return (
    <div data-figma-id="14:1625" css={LabelCss} {...restProps}>
      <span data-figma-id="14:1626" css={TitleCss}>
        Interaction
      </span>
      <div data-figma-id="14:1627" css={Frame960Css}>
        <div css={labelCss}>
          <_Label titleBg="#000000" titleText="Normal" />
        </div>
        <div css={labelCss}>
          <_Label titleBg="#000000" titleText="Pressed" />
        </div>
      </div>
      {children}
    </div>
  );
}
