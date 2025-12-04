/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import styled from "@emotion/styled";
import React, { ReactNode } from "react";

// --- Types ---
type ButtonSize = "Large" | "Medium" | "Small";
type ButtonState = "Default" | "Hover" | "Pressed" | "Disabled";

interface PrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  buttonState?: ButtonState; // 'state'는 HTML 속성과 충돌 가능성이 있어 buttonState로 명명
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  text?: string;
}

// --- Design Tokens (from JSON) ---
const COLORS = {
  white: "#FFFFFF",
  primary300: "#B0EBEC", // Disabled state background from JSON
  primary500: "#2D0830", // Default state (유추/임의 설정, 필요시 수정)
  primary600: "#65DE64", // Hover state
  primary700: "#DAABE5", // Pressed state
};

// --- Styles Mixins ---

// 1. Size & Typography Styles
const getSizeStyles = (size: ButtonSize) => {
  switch (size) {
    case "Large":
      return css`
        padding: 8px;
        font-size: 16px;
        line-height: 24px; // 150%
        min-width: 90px; // From Figma "Min Width" layer
        height: 40px;
      `;
    case "Medium":
      return css`
        padding: 7px 8px;
        font-size: 14px;
        line-height: 22px; // 157.143%
        min-width: 82px; // From Figma "Min Width" layer
        height: 36px;
      `;
    default:
      return css``;
  }
};

// 2. State Styles (Colors & Interaction)
const getStateStyles = (state: ButtonState) => {
  switch (state) {
    case "Disabled":
      return css`
        background-color: ${COLORS.primary300};
        color: ${COLORS.white};
        cursor: not-allowed;
        pointer-events: none; // 클릭 방지
      `;
    case "Hover":
      return css`
        background-color: ${COLORS.primary600}; // 예시 색상
        color: ${COLORS.white};
        cursor: pointer;
      `;
    case "Pressed":
      return css`
        background-color: ${COLORS.primary700}; // 예시 색상
        color: ${COLORS.white};
        cursor: pointer;
      `;
    case "Default":
    default:
      return css`
        background-color: ${COLORS.primary300}; // JSON 예시가 Disabled(Primary/300)만 있어 기본값으로 설정
        /* 실제 Default 색상이 있다면 여기를 변경하세요. 예: COLORS.primary500 */
        color: ${COLORS.white};
        cursor: pointer;
        &:hover {
          opacity: 0.9;
        }
      `;
  }
};

// --- Styled Components ---

const StyledButton = styled.button<{
  sizeVariant: ButtonSize;
  stateVariant: ButtonState;
}>`
  /* Base Layout */
  display: inline-flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 4px; /* Icon과 Text 사이 간격 */

  /* Borders & Radius */
  border: none;
  border-radius: 4px;

  /* Typography Common */
  font-family:
    "PingFang SC",
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;

  /* Transition */
  transition: all 0.2s ease-in-out;

  /* Dynamic Styles */
  ${({ sizeVariant }) => getSizeStyles(sizeVariant)}
  ${({ stateVariant }) => getStateStyles(stateVariant)}
`;

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  size = "Large",
  buttonState = "Default",
  leftIcon,
  rightIcon,
  text,
  children,
  ...props
}) => {
  // Figma 상 'Disabled' 상태가 주어졌을 때의 처리
  const finalState = props.disabled ? "Disabled" : buttonState;

  return (
    <StyledButton
      sizeVariant={size}
      stateVariant={finalState}
      disabled={finalState === "Disabled"}
      {...props}
    >
      {/* Left Icon Slot */}
      {leftIcon && leftIcon}

      {/* Text Content */}
      <span>{children || text}</span>

      {/* Right Icon Slot */}
      {rightIcon && rightIcon}
    </StyledButton>
  );
};
