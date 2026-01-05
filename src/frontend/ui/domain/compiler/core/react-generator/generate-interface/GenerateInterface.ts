import ts, { NodeFactory } from "typescript";
import { FinalAstTree } from "@compiler";
import { capitalize } from "@compiler/utils/stringUtils";
import { ArraySlot, ArraySlotItemProp } from "@compiler/core/ArraySlotDetector";

class GenerateInterface {
  private factory: NodeFactory;
  private astTree: FinalAstTree;
  private arraySlots: ArraySlot[];

  constructor(
    factory: NodeFactory,
    astTree: FinalAstTree,
    arraySlots: ArraySlot[] = []
  ) {
    this.factory = factory;
    this.astTree = astTree;
    this.arraySlots = arraySlots;
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
    componentName = capitalize(componentName);
    const semanticRol = this.astTree.semanticRole;

    const members = this._getPropsMember();
    const heritageClauses = this._getHeritageClauses(semanticRol);

    const interfaceDeclaration = this.factory.createInterfaceDeclaration(
      [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      `${componentName}Props`,
      undefined,
      heritageClauses,
      members
    );

    return interfaceDeclaration;
  }

  /**
   * Props의 variant 타입 별칭 생성
   * 예: type Size = "Large" | "Medium" | "Small";
   */
  public createPropTypeAliases(): ts.TypeAliasDeclaration[] {
    const typeAliases: ts.TypeAliasDeclaration[] = [];

    for (const [propName, propDef] of Object.entries(this.astTree.props)) {
      const prop = propDef as any;

      // variantOptions가 있는 경우에만 타입 별칭 생성
      if (
        prop.type !== "BOOLEAN" &&
        prop.variantOptions &&
        prop.variantOptions.length > 0
      ) {
        const typeName = capitalize(propName);
        const literals = prop.variantOptions.map((opt: string) =>
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

    return typeAliases;
  }

  /**
   * rootElement 값에 따라 적절한 extends 타입을 생성
   * @param rootElement HTML 요소 이름 (예: "button", "input", "text", "div" 등)
   * @returns ExpressionWithTypeArguments 또는 null (extends가 필요없는 경우)
   */
  public createExtendsType(
    rootElement: string | null | undefined
  ): ts.ExpressionWithTypeArguments | null {
    if (!rootElement) {
      return null;
    }

    const normalizedElement = rootElement.toLowerCase().trim();

    // React 네임스페이스 접근
    const reactNamespace = this.factory.createIdentifier("React");

    switch (normalizedElement) {
      case "button":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "ButtonHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLButtonElement", undefined)]
        );

      case "input":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "InputHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLInputElement", undefined)]
        );

      case "textarea":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "TextareaHTMLAttributes"
          ),
          [
            this.factory.createTypeReferenceNode(
              "HTMLTextAreaElement",
              undefined
            ),
          ]
        );

      case "select":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "SelectHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLSelectElement", undefined)]
        );

      case "a":
      case "link":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "AnchorHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLAnchorElement", undefined)]
        );

      case "form":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "FormHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLFormElement", undefined)]
        );

      case "img":
      case "image":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "ImgHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLImageElement", undefined)]
        );

      case "label":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "LabelHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLLabelElement", undefined)]
        );

      case "ul":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "UListHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLUListElement", undefined)]
        );

      case "ol":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "OListHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLOListElement", undefined)]
        );

      case "li":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "LiHTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLLIElement", undefined)]
        );

      case "h1":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "HTMLAttributes"
          ),
          [
            this.factory.createTypeReferenceNode(
              "HTMLHeadingElement",
              undefined
            ),
          ]
        );

      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "HTMLAttributes"
          ),
          [
            this.factory.createTypeReferenceNode(
              "HTMLHeadingElement",
              undefined
            ),
          ]
        );

      case "p":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "HTMLAttributes"
          ),
          [
            this.factory.createTypeReferenceNode(
              "HTMLParagraphElement",
              undefined
            ),
          ]
        );

      case "span":
      case "text":
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "HTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLSpanElement", undefined)]
        );

      case "div":
      case "section":
      case "article":
      case "header":
      case "footer":
      case "nav":
      case "aside":
      case "main":
      default:
        // 기본적으로 div로 처리
        return this.factory.createExpressionWithTypeArguments(
          this.factory.createPropertyAccessExpression(
            reactNamespace,
            "HTMLAttributes"
          ),
          [this.factory.createTypeReferenceNode("HTMLDivElement", undefined)]
        );
    }
  }

  private _getPropsMember() {
    const members: ts.TypeElement[] = [];

    // 배열 슬롯과 연관된 prop 이름들 (제거 대상)
    const arraySlotRelatedProps = this._getArraySlotRelatedProps();

    for (const [propName, propDef] of Object.entries(this.astTree.props)) {
      // 배열 슬롯과 연관된 prop은 건너뛰기 (예: "options" → "2 options" | "3 options")
      if (arraySlotRelatedProps.has(propName.toLowerCase())) {
        continue;
      }

      const prop = propDef as any;
      const propWithName = { ...prop, name: propName };
      const typeNode = this._createPropTypeNode(propWithName);
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

    // 배열 슬롯 props 추가 (중복 제거)
    const processedSlotNames = new Set<string>();
    for (const slot of this.arraySlots) {
      // 동일한 slotName은 한 번만 추가
      if (processedSlotNames.has(slot.slotName)) {
        continue;
      }
      processedSlotNames.add(slot.slotName);

      const arrayTypeNode = this._createArraySlotTypeNode(slot);
      const propSig = this.factory.createPropertySignature(
        undefined,
        slot.slotName,
        undefined, // 배열 슬롯은 필수
        arrayTypeNode
      );
      members.push(propSig);
    }

    return members;
  }

  /**
   * 배열 슬롯과 연관된 prop 이름들 추출
   * 예: slotName이 "options"이고 variant에 "Options"가 있으면 "options" 반환
   */
  private _getArraySlotRelatedProps(): Set<string> {
    const relatedProps = new Set<string>();

    for (const slot of this.arraySlots) {
      // slotName과 일치하는 prop 찾기
      relatedProps.add(slot.slotName.toLowerCase());
    }

    return relatedProps;
  }

  /**
   * 배열 슬롯의 타입 노드 생성
   * Array<{ size?: Size; selected?: boolean; ... }>
   */
  private _createArraySlotTypeNode(slot: ArraySlot): ts.TypeNode {
    // 아이템 타입의 프로퍼티들 생성
    const itemProperties: ts.TypeElement[] = slot.itemProps.map((prop) => {
      const typeNode = this._createItemPropTypeNode(prop);

      return this.factory.createPropertySignature(
        undefined,
        prop.name,
        this.factory.createToken(ts.SyntaxKind.QuestionToken), // 모든 아이템 prop은 optional
        typeNode
      );
    });

    // 객체 타입 리터럴 생성: { size?: Size; selected?: boolean; }
    const objectType = this.factory.createTypeLiteralNode(itemProperties);

    // Array<...> 타입 참조 생성
    return this.factory.createTypeReferenceNode("Array", [objectType]);
  }

  /**
   * 배열 아이템의 prop 타입 노드 생성
   */
  private _createItemPropTypeNode(prop: ArraySlotItemProp): ts.TypeNode {
    switch (prop.type) {
      case "VARIANT":
        if (prop.values && prop.values.length > 0) {
          // 유니온 타입 생성: "value1" | "value2" | ...
          const literals = prop.values.map((v) =>
            this.factory.createLiteralTypeNode(
              this.factory.createStringLiteral(v)
            )
          );
          return this.factory.createUnionTypeNode(literals);
        }
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      case "BOOLEAN":
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
      case "TEXT":
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      default:
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
    }
  }

  private _getHeritageClauses(semanticRol: string | null | undefined) {
    let heritageClauses: ts.HeritageClause[] | undefined = undefined;
    const extendsType = this.createExtendsType(semanticRol);

    if (extendsType) {
      heritageClauses = [
        this.factory.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [
          extendsType,
        ]),
      ];
    }

    return heritageClauses;
  }

  /**
   * Prop 정의를 TypeScript TypeNode로 변환
   */
  private _createPropTypeNode(propDef: any): ts.TypeNode {
    // variantOptions가 있으면 타입 참조로 변환 (별도 타입 별칭 생성)
    if (
      propDef.type !== "BOOLEAN" &&
      propDef.variantOptions &&
      propDef.variantOptions.length > 0
    ) {
      // propName을 대문자로 변환하여 타입 이름 생성 (예: "size" → "Size")
      // propName은 _getPropsMember에서 전달되므로 여기서는 propDef.name 사용
      const typeName = capitalize(propDef.name || "");
      return this.factory.createTypeReferenceNode(typeName, undefined);
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
