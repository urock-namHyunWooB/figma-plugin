import React from "react";
import { css } from "@emotion/react";

export type Size = "default" | "large" | "small";
export type Options = "2 options" | "3 options";
export interface SelectbuttonsProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  options?: Options;
}

const SelectbuttonsCss = css`
  display: flex;
  width: 280px;
  padding: 4px;
  align-items: flex-start;
  gap: 4px;
  border-radius: 3px;
  background: var(--Light-gray-2, #f2f2f2);
`;
const Option1SizeStyles = {
  default: { height: "24px", padding: "4px 41px 4px 42px" },
  large: { height: "28px", padding: "4px 37px 4px 38px" },
  small: { height: "20px", padding: "2px 41px 2px 42px" },
};
const Option1Css = ($size: NonNullable<SelectbuttonsProps["size"]>) => css`
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
  border-radius: 3px;
  ${Option1SizeStyles[$size]}
`;

export default function Selectbuttons(props: SelectbuttonsProps) {
  const { size = "default", options = "2 options", ...restProps } = props;
  return (
    <button css={SelectbuttonsCss} {...restProps}>
      <Option1 css={Option1Css(size)} />
      {size === "default" && options === "2 options" && <Option2 />}
      {size === "default" && options === "3 options" && <Option1 />}
      {size === "default" && options === "3 options" && <Option2 />}
      {size === "default" && options === "3 options" && <Option3 />}
    </button>
  );
}
