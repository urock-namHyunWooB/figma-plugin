import ts from "typescript";

/**
 * React Hooks 생성
 */

/**
 * 스타일 값을 TypeScript Expression으로 변환
 */
function convertStyleValueToExpression(
  factory: ts.NodeFactory,
  value: any
): ts.Expression {
  if (typeof value === "string") {
    return factory.createStringLiteral(value);
  }
  if (typeof value === "number") {
    return factory.createNumericLiteral(value);
  }
  if (typeof value === "boolean") {
    return value ? factory.createTrue() : factory.createFalse();
  }
  if (value === null || value === undefined) {
    return factory.createNull();
  }
  return factory.createIdentifier("undefined");
}

/**
 * useState Hook 선언 생성: const [stateName, setStateName] = useState(initialValue);
 */
export function createUseStateHook(
  factory: ts.NodeFactory,
  stateName: string,
  initialValue?: any
): ts.VariableStatement {
  const setterName = `set${stateName
    .charAt(0)
    .toUpperCase()}${stateName.slice(1)}`;

  const initialValueNode = convertStyleValueToExpression(
    factory,
    initialValue !== undefined ? initialValue : null
  );

  const useStateCall = factory.createCallExpression(
    factory.createIdentifier("useState"),
    undefined,
    [initialValueNode]
  );

  const arrayBinding = factory.createArrayBindingPattern([
    factory.createBindingElement(
      undefined,
      undefined,
      factory.createIdentifier(stateName),
      undefined
    ),
    factory.createBindingElement(
      undefined,
      undefined,
      factory.createIdentifier(setterName),
      undefined
    ),
  ]);

  return factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          arrayBinding,
          undefined,
          undefined,
          useStateCall
        ),
      ],
      ts.NodeFlags.Const
    )
  );
}

