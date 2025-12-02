import ts from "typescript";
import type { PropIR } from "../../types/props";

/**
 * PropIR[]를 TypeScript InterfaceDeclaration으로 변환
 *
 * PropIR[] → ts.InterfaceDeclaration
 */
export function generatePropsInterface(
  props: PropIR[],
  componentName: string
): ts.InterfaceDeclaration {
  debugger;
  const members: ts.TypeElement[] = [];

  for (const prop of props) {
    const typeNode = createPropTypeNode(prop);
    const propSig = ts.factory.createPropertySignature(
      undefined,
      prop.normalizedName,
      prop.optional
        ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
        : undefined,
      typeNode
    );

    members.push(propSig);
  }

  const interfaceDeclaration = ts.factory.createInterfaceDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    `${componentName}Props`,
    undefined,
    undefined,
    members
  );

  return interfaceDeclaration;
}

/**
 * PropIR의 type을 TypeScript TypeNode로 변환
 * variantOptions가 있으면 유니온 타입으로 변환
 */
function createPropTypeNode(prop: PropIR): ts.TypeNode {
  // variantOptions가 있으면 유니온 타입으로 변환 (type이 VARIANT가 아니어도)
  if (prop.variantOptions && prop.variantOptions.length > 0) {
    const literals = prop.variantOptions.map((opt) =>
      ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(opt))
    );
    return ts.factory.createUnionTypeNode(literals);
  }

  switch (prop.type) {
    case "VARIANT": {
      // variantOptions가 없으면 string으로 fallback
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    }
    case "BOOLEAN":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
    case "TEXT":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    case "COMPONENT": {
      // React.ReactNode 타입으로 변환
      return ts.factory.createTypeReferenceNode(
        ts.factory.createQualifiedName(
          ts.factory.createIdentifier("React"),
          "ReactNode"
        ),
        undefined
      );
    }
    case "ANY":
    default:
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
  }
}

/**
 * Props 파라미터 생성: props: ComponentNameProps
 * destructuring 형태로 생성: { size = "Large", icon = false }: ComponentNameProps
 */
export function createPropsParameter(
  factory: ts.NodeFactory,
  componentName: string,
  propsIR: PropIR[]
): ts.ParameterDeclaration[] {
  if (propsIR.length === 0) {
    return [];
  }

  const propsTypeName = `${componentName}Props`;

  const elements: ts.BindingElement[] = propsIR.map((p) => {
    const nameId = factory.createIdentifier(p.normalizedName); // "size", "leftIcon" 등 camelCase

    let initializer: ts.Expression | undefined;

    if (p.defaultValue !== undefined) {
      if (p.type === "COMPONENT") {
        // COMPONENT 타입은 default value를 지원하지 않음
      } else {
        if (typeof p.defaultValue === "string") {
          initializer = factory.createStringLiteral(p.defaultValue);
        } else if (typeof p.defaultValue === "boolean") {
          initializer = p.defaultValue
            ? factory.createTrue()
            : factory.createFalse();
        } else if (typeof p.defaultValue === "number") {
          initializer = factory.createNumericLiteral(p.defaultValue);
        }
      }
    }

    return factory.createBindingElement(
      undefined,
      undefined,
      nameId,
      initializer
    );
  });

  const bindingPattern = factory.createObjectBindingPattern(elements);

  return [
    factory.createParameterDeclaration(
      undefined,
      undefined,
      bindingPattern, // { size = "Large", icon = false }
      undefined,
      factory.createTypeReferenceNode(
        factory.createIdentifier(propsTypeName),
        undefined
      ),
      undefined
    ),
  ];
}
