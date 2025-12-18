import React from "react";
import styled from "@emotion/styled";

interface Props {
  size?: "Large" | "Medium" | "Small";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  text: string;
}

const PrimaryComponent = styled.button<Props>`
  align-items: center;
  background: var(--Primary-600, #15c5ce);
  border-radius: 4px;
  display: inline-flex;
  flex-direction: column;
  justify-content: center;

  & .Frame_427318163 {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: center;
  }

  &:active {
    background: var(--Primary-700, #00abb6);
  }

  &:disabled {
    background: var(--Primary-300, #b0ebec);
  }

  &:hover {
    cursor: pointer;
    background: var(--Primary-500, #47cfd6);
  }

  ${({ size }) => {
    return (
      {
        Large: "padding: 8px;",
        Medium: "padding: 7px 8px;",
        Small: "padding: 3px 4px;",
      }[size || "Large"] || ""
    );
  }}

  & .Plus15_12975 {
    ${({ size }) =>
      ({
        Large: "padding: 8px;",
        Medium: "padding: 7px 8px;",
        Small: "padding: 3px 4px;",
      })[size || "Large"] || ""}
  }

  & .Plus15_12981 {
    ${({ size }) =>
      ({
        Large: "padding: 8px;",
        Medium: "padding: 7px 8px;",
        Small: "padding: 3px 4px;",
      })[size || "Large"] || ""}
  }

  & .Text15_12976 {
    color: var(--black-white-white, #fff);
    text-align: center;
    font-family: '"PingFang SC"';
    font-style: normal;
    font-weight: 500;

    ${({ size }) => {
      return (
        {
          Large: "font-size: 16px; line-height: 24px;",
          Medium: "font-size: 14px; line-height: 22px;",
          Small: "font-size: 12px; line-height: 18px;",
        }[size || "Large"] || ""
      );
    }}
  }
`;

function Primary(props: Props) {
  const { size = "Large", leftIcon, rightIcon, text } = props;

  return (
    <PrimaryComponent
      size={size}
      leftIcon={leftIcon}
      rightIcon={rightIcon}
      text={text}
      className="PrimaryComponent"
    >
      <div className="Frame_427318163">
        {leftIcon && <div className="Plus15_12975">{leftIcon}</div>}
        <span className="Text15_12976">{text}</span>
        {rightIcon && <div className="Plus15_12981">{rightIcon}</div>}
      </div>
    </PrimaryComponent>
  );
}

export default Primary;
