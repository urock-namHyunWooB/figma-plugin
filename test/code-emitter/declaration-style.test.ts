import { describe, it, expect } from "vitest";
import { wrapComponent, type DeclarationStyle, type ExportStyle } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator";

const sampleBody = `  const { size, ...restProps } = props;

  return (
    <button {...restProps}>{size}</button>
  );`;

describe("wrapComponent", () => {
  it("function + default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "function",
      exportStyle: "default",
    });
    expect(result).toContain("function Button(props: ButtonProps) {");
    expect(result).toContain("export default Button");
    expect(result).not.toContain("export default function");
    expect(result).not.toContain("=>");
  });

  it("function + inline-default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "function",
      exportStyle: "inline-default",
    });
    expect(result).toContain("export default function Button(props: ButtonProps) {");
    expect(result).not.toMatch(/\nexport default Button/);
  });

  it("function + named", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "function",
      exportStyle: "named",
    });
    expect(result).toContain("export function Button(props: ButtonProps) {");
    expect(result).not.toContain("export default");
  });

  it("arrow + default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow",
      exportStyle: "default",
    });
    expect(result).toContain("const Button = (props: ButtonProps) => {");
    expect(result).toContain("export default Button");
    expect(result).toMatch(/\};/);
  });

  it("arrow + named", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow",
      exportStyle: "named",
    });
    expect(result).toContain("export const Button = (props: ButtonProps) => {");
    expect(result).not.toContain("export default");
  });

  it("arrow-fc + default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow-fc",
      exportStyle: "default",
    });
    expect(result).toContain("const Button: React.FC<ButtonProps> = (props) => {");
    expect(result).toContain("export default Button");
  });

  it("arrow-fc + named", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow-fc",
      exportStyle: "named",
    });
    expect(result).toContain("export const Button: React.FC<ButtonProps> = (props) => {");
    expect(result).not.toContain("export default");
  });

  it("arrow + inline-default → fallback to default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow",
      exportStyle: "inline-default",
    });
    expect(result).toContain("const Button = (props: ButtonProps) => {");
    expect(result).toContain("export default Button");
  });

  it("arrow-fc + inline-default → fallback to default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow-fc",
      exportStyle: "inline-default",
    });
    expect(result).toContain("const Button: React.FC<ButtonProps> = (props) => {");
    expect(result).toContain("export default Button");
  });
});
