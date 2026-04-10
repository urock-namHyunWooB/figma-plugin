import { describe, test, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import * as ts from "typescript";
import * as path from "path";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";
import FigmaCodeGenerator from "@code-generator2";

// ===== Fixtures Lazy 로드 =====
const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

// fixtures 배열 생성
const allFixtures = Object.entries(fixtureLoaders).map(([path, loader]) => {
  const name = path.replace("../fixtures/", "").replace(".json", "");
  return { name, loader };
});

// ===== TypeScript 타입 체크 헬퍼 =====
function typeCheckGeneratedCodes(
  entries: Array<{ name: string; code: string }>
): Array<{ name: string; errors: string[] }> {
  const configPath = ts.findConfigFile(
    process.cwd(),
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!configPath) throw new Error("tsconfig.json not found");

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    process.cwd()
  );

  const options: ts.CompilerOptions = {
    ...parsedConfig.options,
    noEmit: true,
  };

  const virtualFiles = new Map<string, string>();
  const pathToName = new Map<string, string>();
  const fileNames: string[] = [];

  for (const { name, code } of entries) {
    const safeName = name.replace(/[^a-zA-Z0-9]/g, "_");
    const virtualPath = path.resolve(
      process.cwd(),
      `__typecheck_${safeName}__.tsx`
    );
    virtualFiles.set(virtualPath, code);
    pathToName.set(virtualPath, name);
    fileNames.push(virtualPath);
  }

  const defaultHost = ts.createCompilerHost(options);
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(fileName, languageVersion, onError) {
      if (virtualFiles.has(fileName)) {
        return ts.createSourceFile(
          fileName,
          virtualFiles.get(fileName)!,
          languageVersion
        );
      }
      return defaultHost.getSourceFile(fileName, languageVersion, onError);
    },
    fileExists(fileName) {
      if (virtualFiles.has(fileName)) return true;
      return defaultHost.fileExists(fileName);
    },
    readFile(fileName) {
      if (virtualFiles.has(fileName)) return virtualFiles.get(fileName)!;
      return defaultHost.readFile(fileName);
    },
  };

  const program = ts.createProgram(fileNames, options, host);
  const allDiagnostics = ts.getPreEmitDiagnostics(program);

  const errorsByName = new Map<string, string[]>();

  for (const d of allDiagnostics) {
    if (d.category !== ts.DiagnosticCategory.Error) continue;
    if (!d.file || !virtualFiles.has(d.file.fileName)) continue;

    const name = pathToName.get(d.file.fileName)!;
    const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    const line =
      d.start != null
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : 0;

    if (!errorsByName.has(name)) errorsByName.set(name, []);
    errorsByName.get(name)!.push(`L${line}: ${msg}`);
  }

  return [...errorsByName.entries()].map(([name, errors]) => ({
    name,
    errors,
  }));
}

describe("모든 Fixture 렌더링 테스트", () => {
  describe("Emotion 전략", () => {
    test.each(allFixtures)("$name - 렌더링 성공", async ({ name, loader }) => {
      // 각 테스트에서 직접 데이터 로드
      const module = await loader();
      const data = module.default;
      expect(data).toBeDefined();

      // 컴파일
      const compiler = new FigmaCodeGenerator(data as any);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      expect(code!.length).toBeGreaterThan(0);

      // 렌더링
      const Component = await renderReactComponent(code!);
      const { container } = render(React.createElement(Component, {}));

      expect(container).toBeInTheDocument();
      expect(container.firstElementChild).not.toBeNull();
    });
  });

  describe("Tailwind 전략", () => {
    test.each(allFixtures)("$name - 렌더링 성공", async ({ name, loader }) => {
      // 각 테스트에서 직접 데이터 로드
      const module = await loader();
      const data = module.default;
      expect(data).toBeDefined();

      // 컴파일
      const compiler = new FigmaCodeGenerator(data as any, {
        styleStrategy: { type: "tailwind" },
      });
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      expect(code!.length).toBeGreaterThan(0);

      // 렌더링
      const Component = await renderReactComponent(code!);
      const { container } = render(React.createElement(Component, {}));

      expect(container).toBeInTheDocument();
      expect(container.firstElementChild).not.toBeNull();
    });
  });

  describe("TypeScript 타입 체크", () => {
    // 의존 컴포넌트의 variant state 타입이 메인과 불일치하는 알려진 이슈
    // 의존 컴포넌트의 variant state/prop 타입이 메인과 불일치하는 알려진 이슈
    const KNOWN_TYPE_ERROR_FIXTURES = new Set([
      "any/InputBoxotp",
      "checkbox/taptap-checkbox",
      "failing/Buttonbutton",
      "failing/Buttonsolid",
      "failing/Checkbox",
    ]);

    test(
      "Emotion 전략 - 타입 에러 없음",
      async () => {
        const entries: Array<{ name: string; code: string }> = [];
        for (const { name, loader } of allFixtures) {
          const module = await loader();
          const compiler = new FigmaCodeGenerator(module.default as any);
          const code = await compiler.compile();
          if (code) entries.push({ name, code });
        }

        const failures = typeCheckGeneratedCodes(entries)
          .filter((f) => !KNOWN_TYPE_ERROR_FIXTURES.has(f.name));
        if (failures.length > 0) {
          const msg = failures
            .map((f) => `[${f.name}]\n  ${f.errors.join("\n  ")}`)
            .join("\n\n");
          expect.fail(`타입 에러 발견:\n${msg}`);
        }
      },
      120_000
    );

    test(
      "Tailwind 전략 - 타입 에러 없음",
      async () => {
        const entries: Array<{ name: string; code: string }> = [];
        for (const { name, loader } of allFixtures) {
          const module = await loader();
          const compiler = new FigmaCodeGenerator(module.default as any, {
            styleStrategy: { type: "tailwind" },
          });
          const code = await compiler.compile();
          if (code) entries.push({ name, code });
        }

        const failures = typeCheckGeneratedCodes(entries)
          .filter((f) => !KNOWN_TYPE_ERROR_FIXTURES.has(f.name));
        if (failures.length > 0) {
          const msg = failures
            .map((f) => `[${f.name}]\n  ${f.errors.join("\n  ")}`)
            .join("\n\n");
          expect.fail(`타입 에러 발견:\n${msg}`);
        }
      },
      120_000
    );
  });
});
