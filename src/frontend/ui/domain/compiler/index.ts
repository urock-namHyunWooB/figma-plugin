export type * from "./types/baseType";
export type * from "./types/customType";
export type { PropDefinition } from "./FigmaCodeGenerator";

// New Architecture Types (v2)
// PropDefinition 충돌을 피하기 위해 선택적 export
export type {
  // Shared Types
  ComponentId,
  ImportStatement,

  // Policy Types
  Policy,
  DataPreparerPolicy,
  TreeBuilderPolicy,
  CodeEmitterPolicy,
  BundlerPolicy,
  Platform,
  StyleStrategy,
  CodeConvention,
  DesignSystemConfig,
  PrettierConfig,
  BundlingOptions,

  // PreparedDesignData Types
  PreparedDesignData,
  PreparedNode,
  ExtractedProps,
  VariantPropDefinition,
  BooleanPropDefinition,
  SlotPropDefinition,
  PropType,

  // DesignTree (IR) Types
  DesignTree,
  DesignNode,
  DesignNodeType,
  ComponentType,
  StyleDefinition,
  SlotDefinition,
  ConditionalRule,
  LoopDefinition,
  ArraySlotInfo,
  ExternalRef,

  // DependencyGraph Types
  DependencyGraph,
  ComponentInfo,
  Cycle,
  CircularDependencyError,

  // Component Interfaces
  IDataPreparer,
  ITreeBuilder,
  ICodeEmitter,
  IBundler,
  IPolicyManager,
  IDependencyAnalyzer,

  // CodeEmitter Output Types
  EmittedCode,

  // FigmaCodeGenerator Options (v2)
  FigmaCodeGeneratorOptionsV2,
} from "./types/architecture";

import FigmaCodeGenerator from "./FigmaCodeGenerator";

// CodeEmitter exports
export {
  ReactEmitter,
  PolicyMapper,
  mapPolicy,
  createDefaultPolicy,
  toPascalCase,
  toCamelCase,
} from "./core/code-emitter";

// New Generators (DesignTree-based)
export {
  ImportsGenerator,
  InterfaceGenerator,
  StylesGenerator,
  ComponentGenerator,
} from "./core/code-emitter";

// Style Strategies
export {
  EmotionStyleStrategy,
  TailwindStyleStrategy,
} from "./core/code-emitter";

export default FigmaCodeGenerator;
