/**
 * typeChecker 단위 테스트
 *
 * - 정상 코드가 통과하는지 검증
 * - 타입 에러 코드가 차단되는지 검증
 * - 실제 생성 패턴에 가까운 코드로 테스트
 */

import { describe, it, expect } from "vitest";
import { typeCheckCode } from "../src/frontend/ui/services/typeChecker";

describe("typeCheckCode", () => {
  // ─────────────────────────────────────────
  // 정상 코드 — 통과해야 함
  // ─────────────────────────────────────────

  it("정상적인 Emotion 컴포넌트 코드를 통과시킨다", () => {
    const code = `
import React from "react";
import { css } from "@emotion/react";

export interface ButtonProps {
  label?: string;
  size?: "Large" | "Small";
  disabled?: boolean;
  onClick?: (e: any) => void;
}

const containerCss = css\`
  display: flex;
  align-items: center;
  padding: 8px 16px;
\`;

const sizeStyles = {
  Large: css\`
    height: 48px;
    font-size: 16px;
  \`,
  Small: css\`
    height: 32px;
    font-size: 12px;
  \`,
};

export default function Button({
  label = "Click me",
  size = "Large",
  disabled = false,
  onClick,
}: ButtonProps) {
  return (
    <button
      css={[containerCss, sizeStyles[size]]}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
`;
    const result = typeCheckCode(code, "Button.tsx");
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("슬롯 props가 있는 컴포넌트를 통과시킨다", () => {
    const code = `
import React from "react";
import { css } from "@emotion/react";

export interface CardProps {
  title?: string;
  iconSlot?: React.ReactNode;
  children?: React.ReactNode;
}

const cardCss = css\`
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 8px;
\`;

export default function Card({
  title = "Title",
  iconSlot,
  children,
}: CardProps) {
  return (
    <div css={cardCss}>
      {iconSlot && <div>{iconSlot}</div>}
      <h3>{title}</h3>
      {children}
    </div>
  );
}
`;
    const result = typeCheckCode(code, "Card.tsx");
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("useState를 사용하는 컴포넌트를 통과시킨다", () => {
    const code = `
import React, { useState } from "react";
import { css } from "@emotion/react";

export interface ToggleProps {
  defaultChecked?: boolean;
}

const toggleCss = css\`
  width: 48px;
  height: 24px;
  border-radius: 12px;
  cursor: pointer;
\`;

export default function Toggle({ defaultChecked = false }: ToggleProps) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <div
      css={toggleCss}
      onClick={() => setChecked((prev) => !prev)}
      role="switch"
      aria-checked={checked}
    >
      <div>{checked ? "ON" : "OFF"}</div>
    </div>
  );
}
`;
    const result = typeCheckCode(code, "Toggle.tsx");
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("SVG를 포함한 컴포넌트를 통과시킨다", () => {
    const code = `
import React from "react";
import { css } from "@emotion/react";

export interface IconProps {}

const iconCss = css\`
  width: 24px;
  height: 24px;
\`;

export default function Icon({}: IconProps) {
  return (
    <div css={iconCss}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 22h20L12 2z" fill="#333" />
        <circle cx="12" cy="12" r="10" stroke="#000" strokeWidth="2" />
        <rect x="4" y="4" width="16" height="16" rx="2" fill="none" />
      </svg>
    </div>
  );
}
`;
    const result = typeCheckCode(code, "Icon.tsx");
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("번들된 멀티 컴포넌트 코드를 통과시킨다", () => {
    const code = `
import React from "react";
import { css } from "@emotion/react";

interface InnerLabelProps {
  text?: string;
}

const innerLabelCss = css\`
  font-size: 14px;
  color: #333;
\`;

const InnerLabel: React.FC<InnerLabelProps> = ({ text = "Label" }) => {
  return <span css={innerLabelCss}>{text}</span>;
};

export interface ButtonProps {
  label?: string;
}

const buttonCss = css\`
  display: flex;
  padding: 8px 16px;
\`;

export default function Button({ label = "Click" }: ButtonProps) {
  return (
    <button css={buttonCss}>
      <InnerLabel text={label} />
    </button>
  );
}
`;
    const result = typeCheckCode(code, "Button.tsx");
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("dynamic variant 스타일 맵 인덱싱을 통과시킨다", () => {
    const code = `
import React from "react";
import { css } from "@emotion/react";

export interface ChipProps {
  variant?: "Primary" | "Secondary" | "Outline";
  size?: "Large" | "Medium" | "Small";
}

const chipCss = css\`
  display: inline-flex;
  border-radius: 16px;
\`;

const chipVariantStyles = {
  Primary: css\`background: #8b5cf6; color: white;\`,
  Secondary: css\`background: #e5e7eb; color: #333;\`,
  Outline: css\`background: transparent; border: 1px solid #d1d5db;\`,
};

const chipSizeStyles = {
  Large: css\`padding: 8px 16px; font-size: 16px;\`,
  Medium: css\`padding: 6px 12px; font-size: 14px;\`,
  Small: css\`padding: 4px 8px; font-size: 12px;\`,
};

export default function Chip({
  variant = "Primary",
  size = "Medium",
}: ChipProps) {
  return (
    <div css={[chipCss, chipVariantStyles[variant], chipSizeStyles[size]]}>
      Chip
    </div>
  );
}
`;
    const result = typeCheckCode(code, "Chip.tsx");
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ─────────────────────────────────────────
  // 에러 코드 — 차단해야 함
  // ─────────────────────────────────────────

  it("boolean 인덱스 타입 에러를 잡는다", () => {
    const code = `
import React from "react";
import { css } from "@emotion/react";

export interface ToggleProps {
  isActive?: boolean;
}

const styles = {
  true: css\`color: green;\`,
  false: css\`color: gray;\`,
};

export default function Toggle({ isActive = false }: ToggleProps) {
  return <div css={styles[isActive]}>Toggle</div>;
}
`;
    const result = typeCheckCode(code, "Toggle.tsx");
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // TS7015 또는 TS2538: boolean은 인덱스 타입으로 사용 불가
    const hasIndexError = result.errors.some(
      (e) => e.message.includes("index") || e.message.includes("boolean")
    );
    expect(hasIndexError).toBe(true);
  });

  it("존재하지 않는 프로퍼티 접근을 잡는다", () => {
    const code = `
import React from "react";
import { css } from "@emotion/react";

export interface ButtonProps {
  label?: string;
}

export default function Button({ label = "Click" }: ButtonProps) {
  return <div>{label.nonExistentMethod()}</div>;
}
`;
    const result = typeCheckCode(code, "Button.tsx");
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("구문 에러를 잡는다", () => {
    const code = `
import React from "react";

export default function Broken(: BrokenProps) {
  return <div>broken</div>;
}
`;
    const result = typeCheckCode(code, "Broken.tsx");
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("타입 불일치를 잡는다", () => {
    const code = `
import React from "react";
import { css } from "@emotion/react";

export interface InputProps {
  value?: string;
}

export default function Input({ value = "text" }: InputProps) {
  const num: number = value;
  return <input value={num} />;
}
`;
    const result = typeCheckCode(code, "Input.tsx");
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────
  // 에러 정보 품질
  // ─────────────────────────────────────────

  it("에러에 라인, 컬럼, 메시지, 코드를 포함한다", () => {
    const code = `
import React from "react";

export default function Comp() {
  const x: string = 123;
  return <div>{x}</div>;
}
`;
    const result = typeCheckCode(code, "Comp.tsx");
    expect(result.success).toBe(false);

    const err = result.errors[0];
    expect(err.line).toBeGreaterThan(0);
    expect(err.column).toBeGreaterThan(0);
    expect(err.message).toBeTruthy();
    expect(err.code).toBeGreaterThan(0);
  });
});
