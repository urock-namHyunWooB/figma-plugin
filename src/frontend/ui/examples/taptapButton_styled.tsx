import React from "react";
import { css } from "@emotion/react";
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
  "display": "flex",
  "align-items": "center",
  "gap": "4px",
  "justify-content": "center"
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
    switch (size) {
      case "Large":
        return css`
          padding: 8px;
        `;
      case "Medium":
        return css`
          padding: 7px 8px;
        `;
      case "Small":
        return css`
          padding: 3px 4px;
        `;
    }
  }}

  & .Plus15_12975 {
    ${({ size }) => {
      switch (size) {
        case "Large":
          return css`
            width: 18px;
            height: 18px;
          `;
        case "Medium":
          return css`
            width: 16px;
            height: 16px;
          `;
        case "Small":
          return css`
            width: 14px;
            height: 14px;
          `;
      }
    }}
  }

  & .Plus15_12981 {
    ${({ size }) => {
      switch (size) {
        case "Large":
          return css`
            width: 18px;
            height: 18px;
          `;
        case "Medium":
          return css`
            width: 16px;
            height: 16px;
          `;
        case "Small":
          return css`
            width: 14px;
            height: 14px;
          `;
      }
    }}
  }

  & .Text15_12976 {
    color: var(--black-white-white, #fff);
    text-align: center;
    font-family: '"PingFang SC"';
    font-style: normal;
    font-weight: 500;

    ${({ size }) => {
      switch (size) {
        case "Large":
          return css`
            font-size: 16px;
            line-height: 24px;
          `;
        case "Medium":
          return css`
            font-size: 14px;
            line-height: 22px;
          `;
        case "Small":
          return css`
            font-size: 12px;
            line-height: 18px;
          `;
      }
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
