// src/ui/wasm/index.ts
let wasmInstance: any = null;

export async function initWasm() {
  if (!wasmInstance) {
    const createEngine = (await import("./build/Engine.js")).default;
    wasmInstance = await createEngine();
  }
  return wasmInstance;
}

export function getWasm() {
  return wasmInstance;
}
