// Internal types — 외부에서 필요한 것만 선택적 export
export type { FigmaNodeData, UITree } from "./types/types";

// Public types (UI-facing)
export type * from "./types/public";
export type { GeneratorOptions as FigmaCodeGeneratorOptions } from "./types/public";

// FigmaCodeGenerator
import FigmaCodeGenerator from "./FigmaCodeGenerator";
export { FigmaCodeGenerator };
export type { CompileResult, VariantInconsistency } from "./FigmaCodeGenerator";
export default FigmaCodeGenerator;
