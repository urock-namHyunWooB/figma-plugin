import { describe, test, expect } from "vitest";
import { transform as sucraseTransform } from "sucrase";

/**
 * sucrase JSX/TSX 변환 테스트
 * Preview가 올바르게 렌더링되는지 검증
 */
describe("Sucrase JSX/TSX 변환 테스트", () => {
  const testCases = [
    {
      name: "기본 JSX",
      code: `
function Button() {
  return <button>Click me</button>;
}`,
    },
    {
      name: "props가 있는 JSX",
      code: `
function Button({ onClick, children }) {
  return <button onClick={onClick}>{children}</button>;
}`,
    },
    {
      name: "css prop (Emotion)",
      code: `
import { css } from "@emotion/react";
const style = css\`color: red;\`;
function Button() {
  return <button css={style}>Click</button>;
}`,
    },
    {
      name: "TypeScript 타입",
      code: `
interface ButtonProps {
  size: "sm" | "lg";
  onClick?: () => void;
}
function Button({ size, onClick }: ButtonProps) {
  return <button onClick={onClick}>{size}</button>;
}`,
    },
    {
      name: "삼항 연산자",
      code: `
function Button({ isLarge }) {
  return <button className={isLarge ? "large" : "small"}>Click</button>;
}`,
    },
    {
      name: "중첩 JSX",
      code: `
function Card() {
  return (
    <div className="card">
      <div className="header">Title</div>
      <div className="body">Content</div>
    </div>
  );
}`,
    },
    {
      name: "Fragment",
      code: `
function List() {
  return (
    <>
      <div>Item 1</div>
      <div>Item 2</div>
    </>
  );
}`,
    },
    {
      name: "map 렌더링",
      code: `
function List({ items }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}`,
    },
  ];

  testCases.forEach(({ name, code }) => {
    test(`${name} - sucrase가 올바르게 변환해야 한다`, () => {
      const result = sucraseTransform(code, {
        transforms: ["typescript", "jsx"],
        jsxRuntime: "classic",
      }).code;

      // 변환 성공
      expect(result).not.toBeNull();

      // React.createElement 호출이 있어야 함
      expect(result).toContain("React.createElement");

      // TypeScript 타입이 제거되어야 함
      expect(result).not.toContain("interface ");

      // css prop이 유지되어야 함 (Emotion 런타임에서 처리)
      if (code.includes("css={")) {
        expect(result).toContain("css:");
      }
    });
  });

  test("실제 컴파일러 출력 코드로 테스트", () => {
    const generatedCode = `
import React from "react";
import { css } from "@emotion/react";

export interface ButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "lg";
  variant?: "primary" | "secondary";
  children?: React.ReactNode;
}

const ButtonCss = css\`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 4px;
\`;

const sizeMap = {
  sm: css\`font-size: 12px;\`,
  lg: css\`font-size: 16px;\`,
};

export default function Button(props: ButtonProps) {
  const { size = "sm", variant = "primary", children, ...restProps } = props;
  return (
    <button css={[ButtonCss, sizeMap[size]]} {...restProps}>
      {children}
    </button>
  );
}
`;

    const result = sucraseTransform(generatedCode, {
      transforms: ["typescript", "jsx"],
      jsxRuntime: "classic",
    }).code;

    // 핵심 요소 확인
    expect(result).toContain("React.createElement");
    expect(result).toContain("css:");
    expect(result).toContain("sizeMap[size]");

    // 타입 제거 확인
    expect(result).not.toContain("ButtonProps extends");
  });
});
