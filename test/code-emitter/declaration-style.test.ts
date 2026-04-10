import { describe, it, expect } from "vitest";
import { wrapComponent, type DeclarationStyle, type ExportStyle } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { ReactEmitter, renameNativeProps } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";
import { SemanticIRBuilder } from "@frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder";
import { ReactBundler } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactBundler";
import type { EmittedCode } from "@frontend/ui/domain/code-generator2/layers/code-emitter/ICodeEmitter";
import taptapButton from "../fixtures/button/taptapButton.json";

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

describe("ReactEmitter declaration options", () => {
  async function emitWith(declarationStyle: DeclarationStyle, exportStyle: ExportStyle) {
    const dm = new DataManager(taptapButton as any);
    const tb = new TreeBuilder(dm);
    const uiTree = tb.build((taptapButton as any).info.document);
    const emitter = new ReactEmitter({ declarationStyle, exportStyle });
    const ir = SemanticIRBuilder.build(renameNativeProps(uiTree));
    return emitter.emit(ir);
  }

  it("arrow + named generates export const arrow", async () => {
    const result = await emitWith("arrow", "named");
    expect(result.code).toContain("export const Primary = (props: PrimaryProps) =>");
    expect(result.code).not.toContain("export default");
  });

  it("function + inline-default generates export default function", async () => {
    const result = await emitWith("function", "inline-default");
    expect(result.code).toContain("export default function Primary(props: PrimaryProps)");
    expect(result.code).not.toMatch(/\nexport default Primary/);
  });

  it("arrow-fc + default generates React.FC with separate export", async () => {
    const result = await emitWith("arrow-fc", "default");
    expect(result.code).toContain("React.FC<PrimaryProps>");
    expect(result.code).toContain("export default Primary");
  });

  it("default options (no args) produce function + export default", async () => {
    const dm = new DataManager(taptapButton as any);
    const tb = new TreeBuilder(dm);
    const uiTree = tb.build((taptapButton as any).info.document);
    const emitter = new ReactEmitter();
    const ir = SemanticIRBuilder.build(renameNativeProps(uiTree));
    const result = await emitter.emit(ir);
    expect(result.code).toContain("function Primary(props: PrimaryProps)");
    expect(result.code).toContain("export default Primary");
  });
});

describe("ReactBundler declaration options", () => {
  const mainFunc: EmittedCode = {
    code: 'import React from "react";\n\nfunction Main(props: MainProps) {\n  return <Sub />;\n}\n\nexport default Main',
    componentName: "Main",
    fileExtension: ".tsx",
  };
  const depFunc: EmittedCode = {
    code: 'import React from "react";\n\ninterface SubProps {\n  label?: string;\n}\n\nfunction Sub(props: SubProps) {\n  return <div>sub</div>;\n}\n\nexport default Sub',
    componentName: "Sub",
    fileExtension: ".tsx",
  };

  it("function style keeps function declaration for deps", () => {
    const bundler = new ReactBundler({ declarationStyle: "function" });
    const result = bundler.bundle(mainFunc, [depFunc]);
    expect(result).toContain("function Sub(");
    expect(result).not.toContain("=>");
    // dependency should not have export
    expect(result).not.toMatch(/export\s+(default\s+)?function Sub/);
  });

  it("arrow style converts deps to arrow functions", () => {
    const bundler = new ReactBundler({ declarationStyle: "arrow" });
    const result = bundler.bundle(mainFunc, [depFunc]);
    expect(result).toContain("const Sub = (");
    expect(result).toContain("=>");
    expect(result).not.toContain("React.FC");
  });

  it("arrow-fc style converts deps to React.FC arrow", () => {
    const bundler = new ReactBundler({ declarationStyle: "arrow-fc" });
    const result = bundler.bundle(mainFunc, [depFunc]);
    expect(result).toContain("React.FC<SubProps>");
    expect(result).toContain("=>");
  });

  it("deps never have export keyword regardless of style", () => {
    for (const style of ["function", "arrow", "arrow-fc"] as DeclarationStyle[]) {
      const bundler = new ReactBundler({ declarationStyle: style });
      const result = bundler.bundle(mainFunc, [depFunc]);
      // Extract only the Sub component part (before Main)
      const subSection = result.split("export default function Main")[0];
      // SubProps interface should not be exported
      expect(subSection).not.toMatch(/export\s+interface SubProps/);
      // Sub function/const should not be exported
      expect(subSection).not.toMatch(/export\s+(default\s+)?(function|const)\s+Sub/);
    }
  });
});
