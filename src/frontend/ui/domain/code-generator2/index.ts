// Types
export type * from "./types/types";
export type * from "./types/emitter";

// FigmaCodeGenerator
import FigmaCodeGenerator from "./FigmaCodeGenerator";
export { FigmaCodeGenerator };
export type { GeneratorOptions, LegacyPropDefinition } from "./FigmaCodeGenerator";

// v1 호환: PropDefinition은 LegacyPropDefinition의 별칭
export type { LegacyPropDefinition as PropDefinition } from "./FigmaCodeGenerator";

export default FigmaCodeGenerator;
