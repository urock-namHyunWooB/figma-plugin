/**
 * 타입 및 인터페이스 모음
 */

// AST 타입
export type { BaseASTNode, ElementASTNode, ComponentAST } from "./ast";

// Props IR 타입
export type { PropIR, PropType } from "./props";

export type { VariantStyleIR } from "./styles";

// 인터페이스
export type {
  IASTGenerator,
  ICodeGenerator,
  IPrettifier,
  ITagMapper,
  IStyleConverter,
} from "./interfaces";

export type * from "./binding";

// Figma REST API 타입
export type {
  FigmaRestApiResponse,
  FigmaRestNode,
  FigmaRestComponentSetNode,
  FigmaRestComponentNode,
  FigmaRestTextNode,
  FigmaRestFrameNode,
  FigmaRestOtherNode,
  ComponentMetadata,
  ComponentSetMetadata,
  StyleMetadata,
  AbsoluteBoundingBox,
  AbsoluteRenderBounds,
  RestConstraints,
  RestColor,
  RestPaint,
  RestEffect,
  RestTextStyle,
  RestInteraction,
  RestLayoutMode,
  RestPrimaryAxisAlignItems,
  RestCounterAxisAlignItems,
  RestPrimaryAxisSizingMode,
  RestCounterAxisSizingMode,
  RestLayoutSizing,
  RestLayoutAlign,
} from "./figma-api";

export {
  isComponentSetNode,
  isComponentNode,
  isTextNode,
  isFrameNode,
} from "./figma-api";

export type * from "./type";
