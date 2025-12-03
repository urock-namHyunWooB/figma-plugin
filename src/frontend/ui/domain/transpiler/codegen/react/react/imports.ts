import ts from "typescript";

/**
 * React import 문 생성
 */

/**
 * React import 문 생성: import React from "react";
 */
export function createReactImport(
  factory: ts.NodeFactory
): ts.ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      false,
      factory.createIdentifier("React"),
      undefined
    ),
    factory.createStringLiteral("react")
  );
}

/**
 * useState import 문 생성: import { useState } from "react";
 */
export function createUseStateImport(
  factory: ts.NodeFactory
): ts.ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      false,
      undefined,
      factory.createNamedImports([
        factory.createImportSpecifier(
          false,
          undefined,
          factory.createIdentifier("useState")
        ),
      ])
    ),
    factory.createStringLiteral("react")
  );
}

/**
 * Emotion css import 문 생성: import { css } from "@emotion/react";
 */
export function createEmotionCssImport(
  factory: ts.NodeFactory
): ts.ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      false,
      undefined,
      factory.createNamedImports([
        factory.createImportSpecifier(
          false,
          undefined,
          factory.createIdentifier("css")
        ),
        factory.createImportSpecifier(
          false,
          undefined,
          factory.createIdentifier("cx")
        ),
      ])
    ),
    factory.createStringLiteral("@emotion/css")
  );
}

export function createEmotionStyledImport(
  factory: ts.NodeFactory
): ts.ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      false,
      factory.createIdentifier("styled"),
      undefined
    ),
    factory.createStringLiteral("@emotion/styled")
  );
}
