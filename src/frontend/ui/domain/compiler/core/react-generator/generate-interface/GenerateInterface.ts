import ts, { NodeFactory } from "typescript";
import { FinalAstTree } from "@compiler";

class GenerateInterface {
  private factory: NodeFactory;
  private astTree: FinalAstTree;

  constructor(factory: NodeFactory, astTree: FinalAstTree) {
    this.factory = factory;
    this.astTree = astTree;
  }

  /**
   * taptapButton,json
   *
   * type Size = "Large" | "Medium" | "Small";
   *
   * interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
   *   size?: Size;
   *   leftIcon?: React.ReactNode;
   *   rightIcon?: React.ReactNode;
   *   text: string;
   * }
   */
  public createPropsInterface(componentName: string): ts.InterfaceDeclaration {
    const members: ts.TypeElement[] = [];

    for (const [propName, propDef] of Object.entries(this.astTree.props)) {
      const prop = propDef as any; // props는 실제로는 객체 타입
      const typeNode = this._createPropTypeNode(prop);
      const isOptional = prop.defaultValue !== undefined;

      const propSig = this.factory.createPropertySignature(
        undefined,
        propName,
        isOptional
          ? this.factory.createToken(ts.SyntaxKind.QuestionToken)
          : undefined,
        typeNode
      );

      members.push(propSig);
    }

    const interfaceDeclaration = this.factory.createInterfaceDeclaration(
      [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      `${componentName}Props`,
      undefined,
      undefined,
      members
    );

    return interfaceDeclaration;
  }

  /**
   * Prop 정의를 TypeScript TypeNode로 변환
   */
  private _createPropTypeNode(propDef: any): ts.TypeNode {
    // variantOptions가 있으면 유니온 타입으로 변환
    if (propDef.variantOptions && propDef.variantOptions.length > 0) {
      const literals = propDef.variantOptions.map((opt: string) =>
        this.factory.createLiteralTypeNode(
          this.factory.createStringLiteral(opt)
        )
      );
      return this.factory.createUnionTypeNode(literals);
    }

    switch (propDef.type) {
      case "SLOT":
        // SLOT은 React.ReactNode 타입
        return this.factory.createTypeReferenceNode(
          this.factory.createQualifiedName(
            this.factory.createIdentifier("React"),
            "ReactNode"
          ),
          undefined
        );
      case "TEXT":
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      case "VARIANT":
        // variantOptions가 없으면 string으로 fallback
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      case "BOOLEAN":
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
      default:
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
    }
  }
}

export default GenerateInterface;
