import React from "react";
import { css } from "@emotion/react";

export interface AIRButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  text?: string;
}

const AIRButtonByType__3087 = {
  default: { background: "var(--Light-gray-2, #F2F2F2)" },
  primary: { background: "var(--blueBright, #2D7FF9)" },
  danger: { background: "var(--red, #EF3061)" },
};
const AIRButtonBySize__3087 = {
  default: { width: "94.5px", height: "32px", justifyContent: "center" },
};
const AIRButtonCss__3087 = ($type: Type, $size: Size) => css`
  align-items: center;
  border-radius: 3px;
  ${AIRButtonByType__3087[$type]}
  ${AIRButtonBySize__3087[$size]}
`;
const IconBySize__71113871 = { default: { flexShrink: "0" } };
const IconCss__71113871 = ($size: Size) => css`
  ${IconBySize__71113871[$size]}
`;
const LabelByType__1545 = {
  default: { color: "var(--Dark, #333)" },
  primary: { color: "var(--White, #FFF)" },
  danger: { color: "var(--White, #FFF)" },
  secondary: { color: "var(--Dark, #333)" },
};
const LabelBySize__1545 = {
  default: { fontSize: "13px", lineHeight: "18px" },
  small: { fontSize: "13px", lineHeight: "18px" },
  large: { fontSize: "15px", lineHeight: "18px" },
};
const LabelCss__1545 = ($type: Type, $size: Size) => css`
  font-family: "SF Pro Text";
  font-style: normal;
  font-weight: 600;
  ${LabelByType__1545[$type]}
  ${LabelBySize__1545[$size]}
`;
const VectorCss_I71113871911059 = css`
  ${""}
`;

export default function AIRButton(props: AIRButtonProps) {
  const { icon = null, text = "Default", ...restProps } = props;
  return (
    <div css={AIRButtonCss__3087(type, size)}>
      {props.icon}
      <span css={LabelCss__1545(type, size)}>{text}</span>
    </div>
  );
}
