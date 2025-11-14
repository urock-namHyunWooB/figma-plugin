/**
 * State 관련 AST 생성
 */

import * as ts from "typescript";
import { createLiteralNode } from "./helpers";

/**
 * useState import 문 생성
 */
export function createUseStateImport(): ts.ImportDeclaration {
  return ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(
          false,
          undefined,
          ts.factory.createIdentifier("useState"),
        ),
      ]),
    ),
    ts.factory.createStringLiteral("react"),
  );
}

/**
 * useState Hook 생성
 */
export function createUseStateHook(
  stateName: string,
  initialValue: any,
): ts.VariableStatement {
  const setterName = `set${stateName
    .charAt(0)
    .toUpperCase()}${stateName.slice(1)}`;

  const initialValueNode = createLiteralNode(initialValue);

  const useStateCall = ts.factory.createCallExpression(
    ts.factory.createIdentifier("useState"),
    undefined,
    [initialValueNode],
  );

  const arrayBinding = ts.factory.createArrayBindingPattern([
    ts.factory.createBindingElement(undefined, undefined, stateName, undefined),
    ts.factory.createBindingElement(
      undefined,
      undefined,
      setterName,
      undefined,
    ),
  ]);

  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          arrayBinding,
          undefined,
          undefined,
          useStateCall,
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}
