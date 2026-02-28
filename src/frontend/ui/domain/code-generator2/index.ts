// Types
export type * from "./types/types";
export type * from "./types/emitter";

// FigmaCodeGenerator
import FigmaCodeGenerator from "./FigmaCodeGenerator";
export { FigmaCodeGenerator };
export type {
  GeneratorOptions,
  GeneratorOptions as FigmaCodeGeneratorOptions,
  PropDefinition,
  CompiledDependency,
  MultiComponentResult,
} from "./FigmaCodeGenerator";

export default FigmaCodeGenerator;
