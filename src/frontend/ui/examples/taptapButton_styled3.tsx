import React from "react";
import { css } from "@emotion/css";


export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "Large" | "Medium" | "Small";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  text?: string;
}


const SizeLargeStateDisabledLeftIconFalseRightIconFalseBySize = { Large: { padding: "8px" }, Medium: { padding: "7px 8px" }, Small: { padding: "3px 4px" } };
const PlusBySize = { Large: { width: "18px", height: "18px" }, Medium: { width: "16px", height: "16px" }, Small: { width: "14px", height: "14px" } };
const TextBySize = { Large: { font-size: "16px", line-height: "24px /* 150% */" }, Medium: { font-size: "14px", line-height: "22px /* 157.143% */" }, Small: { font-size: "12px", line-height: "18px /* 150% */" } };
const UnionBySize = { Large: { width: "15px", height: "15px" }, Medium: { width: "13.333px", height: "13.333px" }, Small: { width: "11.667px", height: "11.667px" } };


export default function Button(props: ButtonProps) {
  return <div className={cx(styles.sizelarge, styles.sizelargeSize[props.size])}><div className={styles.frame}>{props.leftIcon}<span className={cx(styles.text, styles.textSize[props.size])}/>{props.rightIcon}</div></div>;
}
