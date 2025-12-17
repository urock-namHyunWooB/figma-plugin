import React from "react";
import { css, cx } from "@emotion/css";
export interface ButtonProps {
  size?: "Large" | "Medium" | "Small";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
export default function Button(props: ButtonProps) {
  const styles = {
    sizelarge: css({
      display: "inline-flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      borderRadius: "4px",
      background: "var(--Primary-600, #15C5CE)",
    }),
    sizelargeSize: {
      Large: css({
        padding: "8px",
        border: "1px solid #000",
      }),
      Medium: css({
        padding: "7px 8px",
      }),
      Small: css({
        padding: "3px 4px",
      }),
    },
    frame: css({
      display: "flex",
      alignItems: "center",
      gap: "4px",
      justifyContent: "center",
    }),
    plusSize: {
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
    },
    text: css({
      color: "var(--black-white-white, #FFF)",
      textAlign: "center",
      fontFamily: '"PingFang SC"',
      fontStyle: "normal",
      fontWeight: "500",
    }),
    textSize: {
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
    },
    plus1: css({
      width: "18px",
      height: "18px",
    }),
    union: css({
      fill: "var(--black-white-white, #FFF)",
    }),
    unionSize: {
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
    },
    union1: css({
      width: "15px",
      height: "15px",
      fill: "var(--black-white-white, #FFF)",
    }),
  };
  return (
    <div className={cx(styles.sizelarge, styles.sizelargeSize[props.size])}>
      <div className={styles.frame}>
        {props.leftIcon}
        <span className={cx(styles.text, styles.textSize[props.size])} />
        {props.rightIcon}
      </div>
    </div>
  );
}
