import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedWasm: any = null;

/**
 * WASM을 한 번만 로드 (테스트 속도 향상)
 */
export async function getWasmEngine() {
  if (cachedWasm) {
    return cachedWasm;
  }

  // WASM 파일을 직접 읽기
  const wasmPath = join(
    __dirname,
    "../../src/frontend/wasm-engine/build/Engine.wasm",
  );
  const wasmBinary = readFileSync(wasmPath);

  // Emscripten 모듈 로드
  const createEngineModule = (
    await import("../../src/frontend/wasm-engine/build/Engine.js")
  ).default;

  // WASM 바이너리를 직접 전달
  const wasm = await createEngineModule({
    wasmBinary: wasmBinary.buffer,
  });

  cachedWasm = wasm;
  return wasm;
}

/**
 * 새 Engine 인스턴스 생성
 */
export async function createEngine() {
  const wasm = await getWasmEngine();
  const engine = new wasm.Engine();
  engine.init();
  return { engine, CodeType: wasm.CodeType };
}

/**
 * 코드 생성 헬퍼
 */
export async function generateReactCode(spec: any) {
  const { engine, CodeType } = await createEngine();
  engine.setComponentSpec(spec);
  return engine.generateCode(CodeType.React, "component.tsx");
}

/**
 * 생성된 코드 검증 헬퍼
 */
export function validateGeneratedCode(code: string) {
  return {
    hasImport: code.includes("import"),
    hasInterface: code.includes("interface"),
    hasFunction: code.includes("function"),
    hasStyles: code.includes("const styles"),
    hasReturn: code.includes("return"),
    hasExport: code.includes("export default"),

    // styles가 function 앞에 있는지
    stylesBeforeFunction: (() => {
      const stylesPos = code.indexOf("const styles");
      const funcPos = code.indexOf("function");
      return stylesPos > 0 && stylesPos < funcPos;
    })(),
  };
}

/**
 * 코드에서 특정 패턴 찾기
 */
export function findInCode(code: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") {
    return code.includes(pattern);
  }
  return pattern.test(code);
}

/**
 * 생성된 코드를 섹션별로 분리
 */
export function parseGeneratedCode(code: string) {
  return {
    imports: code.split("\n").filter((l) => l.startsWith("import")),
    interface: code.match(/interface\s+\w+Props\s*{[^}]+}/)?.[0] || "",
    styles: code.match(/const\s+styles\s*=\s*{[\s\S]*?};\n/)?.[0] || "",
    function: code.match(/function\s+\w+[\s\S]*?^}/m)?.[0] || "",
    export: code.split("\n").find((l) => l.startsWith("export")) || "",
  };
}
