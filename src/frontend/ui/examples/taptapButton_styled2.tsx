import React from "react";
import styled from "@emotion/styled";

type Size = "Large" | "Medium" | "Small";

interface Props {
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  text: string;
}

const paddingBySize = {
  Large: "padding: 8px;",
  Medium: "padding: 7px 8px;",
  Small: "padding: 3px 4px;",
};

const iconBySize = {
  Large: "width: 18px; height: 18px;",
  Medium: "width: 16px; height: 16px;",
  Small: "width: 14px; height: 14px;",
};

const textBySize = {
  Large: "font-size: 16px; line-height: 24px;",
  Medium: "font-size: 14px; line-height: 22px;",
  Small: "font-size: 12px; line-height: 18px;",
};

const PrimaryButton = styled.button<{ $size: Size }>`
  align-items: center;
  background: var(--Primary-600, #15c5ce);
  border-radius: 4px;
  display: inline-flex;
  flex-direction: column;
  justify-content: center;

  ${({ $size }) => paddingBySize[$size]};

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
`;

const Content = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
`;

const IconSlot = styled.span<{ $size: Size }>`
  ${({ $size }) => iconBySize[$size]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;

  & > svg,
  & > img {
    width: 100%;
    height: 100%;
    display: block;
  }

  & > * {
    max-width: 100%;
    max-height: 100%;
  }
`;

const Label = styled.span<{ $size: Size }>`
  color: var(--black-white-white, #fff);
  text-align: center;
  font-family: '"PingFang SC"';
  font-style: normal;
  font-weight: 500;

  ${({ $size }) => textBySize[$size]};
`;

function Primary(props: Props) {
  const { size = "Large", leftIcon, rightIcon, text } = props;

  return (
    <PrimaryButton $size={size}>
      <Content>
        {leftIcon && <IconSlot $size={size}>{leftIcon}</IconSlot>}
        <Label $size={size}>{text}</Label>
        {rightIcon && <IconSlot $size={size}>{rightIcon}</IconSlot>}
      </Content>
    </PrimaryButton>
  );
}

export default Primary;
