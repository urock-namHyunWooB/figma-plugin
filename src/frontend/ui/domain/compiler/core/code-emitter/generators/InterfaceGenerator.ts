/**
 * InterfaceGenerator
 *
 * DesignTree에서 Props 인터페이스와 타입 별칭을 생성합니다.
 *
 * 생성 예시:
 * ```typescript
 * export type Size = "Large" | "Medium" | "Small";
 *
 * export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
 *   size?: Size;
 *   leftIcon?: React.ReactNode;
 *   text: string;
 * }
 * ```
 */

import ts from "typescript";
import type {
  DesignTree,
  PropDefinition,
  ArraySlotInfo,
  SemanticRole,
} from "@compiler/types/architecture";
import { capitalize } from "@compiler/utils/stringUtils";

class InterfaceGenerator {
  private factory: ts.NodeFactory;

  constructor(factory: ts.NodeFactory) {
    this.factory = factory;
  }

  /**
   * Props 인터페이스와 타입 별칭 생성
   *
   * @param tree - DesignTree
   * @param componentName - 컴포넌트 이름
   * @returns 타입 별칭 + 인터페이스 선언 배열
   */
  generate(tree: DesignTree, componentName: string): ts.Statement[] {
    const statements: ts.Statement[] = [];

    // 1. 타입 별칭 생성 (variant props)
    statements.push(...this.createPropTypeAliases(tree.props));

    // 2. Props 인터페이스 생성
    statements.push(this.createPropsInterface(tree, componentName));

    return statements;
  }

  /**
   * Props의 variant 타입 별칭 생성
   * 예: export type Size = "Large" | "Medium" | "Small";
   */
  createPropTypeAliases(props: PropDefinition[]): ts.TypeAliasDeclaration[] {
    const typeAliases: ts.TypeAliasDeclaration[] = [];

    for (const prop of props) {
      // variant 타입만 타입 별칭 생성
      if (prop.type === "variant") {
        const variantProp = prop as any;
        if (variantProp.options && variantProp.options.length > 0) {
          const typeName = capitalize(prop.name);
          const literals = variantProp.options.map((opt: string) =>
            this.factory.createLiteralTypeNode(
              this.factory.createStringLiteral(opt)
            )
          );
          const unionType = this.factory.createUnionTypeNode(literals);

          const typeAlias = this.factory.createTypeAliasDeclaration(
            [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            typeName,
            undefined,
            unionType
          );

          typeAliases.push(typeAlias);
        }
      }
    }

    return typeAliases;
  }

  /**
   * Props 인터페이스 생성
   */
  createPropsInterface(
    tree: DesignTree,
    componentName: string
  ): ts.InterfaceDeclaration {
    const capitalizedName = capitalize(componentName);
    const semanticRole = tree.root.semanticRole;

    const members = this.createPropsMembers(tree);
    const heritageClauses = this.createHeritageClauses(semanticRole);

    return this.factory.createInterfaceDeclaration(
      [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      `${capitalizedName}Props`,
      undefined,
      heritageClauses,
      members
    );
  }

  /**
   * Props 멤버 생성
   */
  private createPropsMembers(tree: DesignTree): ts.TypeElement[] {
    const members: ts.TypeElement[] = [];

    // 배열 슬롯과 연관된 prop 이름들 (제거 대상)
    const arraySlotRelatedProps = this.getArraySlotRelatedProps(tree.arraySlots);

    // 일반 props
    for (const prop of tree.props) {
      // 배열 슬롯과 연관된 prop은 건너뛰기
      if (arraySlotRelatedProps.has(prop.name.toLowerCase())) {
        continue;
      }

      const typeNode = this.createPropTypeNode(prop);
      const isOptional = prop.defaultValue !== undefined || !prop.required;

      const propSig = this.factory.createPropertySignature(
        undefined,
        prop.name,
        isOptional
          ? this.factory.createToken(ts.SyntaxKind.QuestionToken)
          : undefined,
        typeNode
      );

      members.push(propSig);
    }

    // 배열 슬롯 props 추가
    const processedSlotNames = new Set<string>();
    for (const slot of tree.arraySlots) {
      if (processedSlotNames.has(slot.name)) {
        continue;
      }
      processedSlotNames.add(slot.name);

      const arrayTypeNode = this.createArraySlotTypeNode(slot, tree.props);
      const propSig = this.factory.createPropertySignature(
        undefined,
        slot.name,
        undefined, // 배열 슬롯은 필수
        arrayTypeNode
      );
      members.push(propSig);
    }

    // children prop 추가 (React 표준)
    const childrenPropSig = this.factory.createPropertySignature(
      undefined,
      "children",
      this.factory.createToken(ts.SyntaxKind.QuestionToken),
      this.factory.createTypeReferenceNode(
        this.factory.createQualifiedName(
          this.factory.createIdentifier("React"),
          "ReactNode"
        ),
        undefined
      )
    );
    members.push(childrenPropSig);

    return members;
  }

  /**
   * 배열 슬롯과 연관된 prop 이름들 추출
   */
  private getArraySlotRelatedProps(arraySlots: ArraySlotInfo[]): Set<string> {
    const relatedProps = new Set<string>();
    for (const slot of arraySlots) {
      relatedProps.add(slot.name.toLowerCase());
    }
    return relatedProps;
  }

  /**
   * 배열 슬롯의 타입 노드 생성
   * Array<{ size?: Size; selected?: boolean; ... }>
   */
  private createArraySlotTypeNode(
    slot: ArraySlotInfo,
    props: PropDefinition[]
  ): ts.TypeNode {
    // 슬롯 아이템에 전달할 props 찾기
    // (TODO: ArraySlotInfo에 itemProps 정보 추가 필요)
    const itemProperties: ts.TypeElement[] = [];

    // 현재는 빈 객체 타입으로 fallback
    const objectType = this.factory.createTypeLiteralNode(itemProperties);

    return this.factory.createTypeReferenceNode("Array", [objectType]);
  }

  /**
   * Prop 정의를 TypeScript TypeNode로 변환
   */
  private createPropTypeNode(prop: PropDefinition): ts.TypeNode {
    switch (prop.type) {
      case "variant": {
        const variantProp = prop as any;
        if (variantProp.options && variantProp.options.length > 0) {
          // 타입 별칭 참조 (예: Size)
          return this.factory.createTypeReferenceNode(
            capitalize(prop.name),
            undefined
          );
        }
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      }

      case "boolean":
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);

      case "slot":
        // SLOT은 React.ReactNode 타입
        return this.factory.createTypeReferenceNode(
          this.factory.createQualifiedName(
            this.factory.createIdentifier("React"),
            "ReactNode"
          ),
          undefined
        );

      case "string":
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);

      case "number":
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);

      default:
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
    }
  }

  /**
   * Heritage clauses 생성 (extends)
   * semanticRole에 따라 적절한 HTML 속성 타입 상속
   */
  private createHeritageClauses(
    semanticRole?: SemanticRole
  ): ts.HeritageClause[] | undefined {
    const extendsType = this.createExtendsType(semanticRole);
    if (!extendsType) {
      return undefined;
    }

    return [
      this.factory.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [
        extendsType,
      ]),
    ];
  }

  /**
   * rootElement 값에 따라 적절한 extends 타입을 생성
   */
  private createExtendsType(
    semanticRole?: SemanticRole
  ): ts.ExpressionWithTypeArguments | null {
    if (!semanticRole) {
      return null;
    }

    const reactNamespace = this.factory.createIdentifier("React");

    switch (semanticRole) {
      case "button":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "ButtonHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLButtonElement", undefined)]
        );

      case "text":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "HTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLSpanElement", undefined)]
        );

      case "image":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "ImgHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLImageElement", undefined)]
        );

      case "container":
      case "root":
      default:
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "HTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLDivElement", undefined)]
        );
    }
  }
}

export default InterfaceGenerator;
