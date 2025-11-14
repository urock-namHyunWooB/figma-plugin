import React from "react";
import { useState } from "react";

interface Props {
  size?: "default" | "large" | "small";
  type?: "default" | "primary" | "danger" | "secondary";
  text?: string;
  isDisabled?: boolean;
  icon?: React.ReactNode;
}

const styles = {
  button: {
    default: {
      default: {
        height: "32px",
        paddingTop: "7px",
        paddingRight: "12px",
        paddingBottom: "7px",
        paddingLeft: "12px",
        borderRadius: "3px",
        backgroundColor: "rgb(242, 242, 242)",
        opacity: 1,
      },
      primary: {
        height: "32px",
        paddingTop: "7px",
        paddingRight: "12px",
        paddingBottom: "7px",
        paddingLeft: "12px",
        borderRadius: "3px",
        backgroundColor: "rgb(45, 127, 249)",
        opacity: 1,
      },
      danger: {
        height: "32px",
        paddingTop: "7px",
        paddingRight: "12px",
        paddingBottom: "7px",
        paddingLeft: "12px",
        borderRadius: "3px",
        backgroundColor: "rgb(239, 48, 97)",
        opacity: 1,
      },
      secondary: {
        height: "32px",
        paddingTop: "7px",
        paddingRight: "12px",
        paddingBottom: "7px",
        paddingLeft: "12px",
        borderRadius: "3px",
        opacity: 1,
      },
    },
    small: {
      default: {
        height: "28px",
        paddingTop: "5px",
        paddingRight: "10px",
        paddingBottom: "5px",
        paddingLeft: "10px",
        borderRadius: "3px",
        backgroundColor: "rgb(242, 242, 242)",
        opacity: 1,
      },
      primary: {
        height: "28px",
        paddingTop: "5px",
        paddingRight: "10px",
        paddingBottom: "5px",
        paddingLeft: "10px",
        borderRadius: "3px",
        backgroundColor: "rgb(45, 127, 249)",
        opacity: 1,
      },
      danger: {
        height: "28px",
        paddingTop: "5px",
        paddingRight: "10px",
        paddingBottom: "5px",
        paddingLeft: "10px",
        borderRadius: "3px",
        backgroundColor: "rgb(239, 48, 97)",
        opacity: 1,
      },
      secondary: {
        height: "28px",
        paddingTop: "5px",
        paddingRight: "10px",
        paddingBottom: "5px",
        paddingLeft: "10px",
        borderRadius: "3px",
        opacity: 1,
      },
    },
    large: {
      default: {
        height: "36px",
        paddingTop: "9px",
        paddingRight: "14px",
        paddingBottom: "9px",
        paddingLeft: "14px",
        borderRadius: "3px",
        backgroundColor: "rgb(242, 242, 242)",
        opacity: 1,
      },
      primary: {
        height: "36px",
        paddingTop: "9px",
        paddingRight: "14px",
        paddingBottom: "9px",
        paddingLeft: "14px",
        borderRadius: "3px",
        backgroundColor: "rgb(45, 127, 249)",
        opacity: 1,
      },
      danger: {
        height: "36px",
        paddingTop: "9px",
        paddingRight: "14px",
        paddingBottom: "9px",
        paddingLeft: "14px",
        borderRadius: "3px",
        backgroundColor: "rgb(239, 48, 97)",
        opacity: 1,
      },
      secondary: {
        height: "36px",
        paddingTop: "9px",
        paddingRight: "14px",
        paddingBottom: "9px",
        paddingLeft: "14px",
        borderRadius: "3px",
        opacity: 1,
      },
    },
  },
  iconContainer: {
    gap: "10px",
  },
};

function AirButton(props: Props) {
  const { icon, text, isDisabled, size = "default", type = "default" } = props;
  const [testState, setTestState] = useState("");
  const buttonStyle = styles.button[size][type];
  return (
    <button style={buttonStyle}>
      {icon && <div id="icon"></div>}
      {text && <div id="label">{text}</div>}
    </button>
  );
}

export default AirButton;
