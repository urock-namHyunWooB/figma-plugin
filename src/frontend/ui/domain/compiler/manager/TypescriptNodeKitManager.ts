import ts, { NodeFactory } from "typescript";

/**
 * TypeScript AST 노드 생성을 위한 고수준 유틸리티 모음
 *
 * NodeKit: 자주 쓰는 패턴을 유틸로 추상화하여 ts.factory 직접 호출을 최소화
 * Escape hatch: 복잡한 노드는 문자열 파싱으로 생성
 */
class TypescriptNodeKitManager {
  private factory: NodeFactory;

  constructor(factory?: NodeFactory) {
    this.factory = factory || ts.factory;
  }

  // ==================== Variable Declarations ====================

  /**
   * const 변수 선언 생성
   * const name = value;
   */
  createConstVariable(
    name: string,
    value: ts.Expression,
    isExported: boolean = false
  ): ts.VariableStatement {
    return this.factory.createVariableStatement(
      isExported
        ? [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)]
        : undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createIdentifier(name),
            undefined,
            undefined,
            value
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * export const 변수 선언 생성
   * export const name = value;
   */
  createExportedConstVariable(
    name: string,
    value: ts.Expression
  ): ts.VariableStatement {
    return this.createConstVariable(name, value, true);
  }

  // ==================== Arrow Functions ====================

  /**
   * 화살표 함수 생성
   * (params) => body
   */
  createArrowFunction(
    params: ts.ParameterDeclaration[],
    body: ts.Expression,
    returnType?: ts.TypeNode
  ): ts.ArrowFunction {
    return this.factory.createArrowFunction(
      undefined,
      undefined,
      params,
      returnType,
      this.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      body
    );
  }

  /**
   * const + arrow function 조합
   * const name = (params) => body;
   */
  createConstArrowFunction(
    name: string,
    params: ts.ParameterDeclaration[],
    body: ts.Expression,
    returnType?: ts.TypeNode,
    isExported: boolean = false
  ): ts.VariableStatement {
    const arrowFunction = this.createArrowFunction(params, body, returnType);
    return this.createConstVariable(name, arrowFunction, isExported);
  }

  /**
   * 단일 파라미터 화살표 함수 생성
   * (paramName: paramType) => body
   */
  createSingleParamArrowFunction(
    paramName: string,
    paramType: ts.TypeNode | undefined,
    body: ts.Expression,
    returnType?: ts.TypeNode
  ): ts.ArrowFunction {
    const param = this.factory.createParameterDeclaration(
      undefined,
      undefined,
      this.factory.createIdentifier(paramName),
      undefined,
      paramType,
      undefined
    );
    return this.createArrowFunction([param], body, returnType);
  }

  // ==================== Template Literals ====================

  /**
   * 템플릿 리터럴 생성
   * `head${expr1}middle${expr2}tail`
   */
  createTemplateLiteral(
    head: string,
    spans: Array<{ expr: ts.Expression; tail: string }>
  ): ts.TemplateExpression {
    // head가 빈 문자열이면 최소한의 공백이라도 넣어야 함
    const safeHead = head || " ";
    // rawText는 템플릿 리터럴에서 실제로 나타나는 문자열 (이스케이프 처리된 형태)
    // 일반적으로 text와 동일하지만, 특수 문자가 있을 경우 다를 수 있음
    const templateHead = this.factory.createTemplateHead(safeHead, safeHead);

    // spans가 비어있으면 빈 TemplateTail을 가진 더미 span을 만들어야 함
    // TypeScript의 createTemplateExpression은 spans 배열이 비어있을 때 템플릿을 닫지 않음
    if (spans.length === 0) {
      // 빈 문자열 리터럴을 사용하여 더미 span 생성 (실제로는 사용되지 않음)
      // 빈 문자열은 CSS에서 무시되므로 안전함
      const dummyExpr = this.factory.createStringLiteral("");
      const templateTail = this.factory.createTemplateTail("", "");
      const dummySpan = this.factory.createTemplateSpan(
        dummyExpr,
        templateTail
      );

      const templateExpression = this.factory.createTemplateExpression(
        templateHead,
        [dummySpan]
      );

      // 디버깅: spans가 비어있을 때 생성된 템플릿 확인
      const printer = ts.createPrinter();
      const sourceFile = ts.createSourceFile(
        "temp.ts",
        "",
        ts.ScriptTarget.Latest,
        true
      );
      const templateText = printer.printNode(
        ts.EmitHint.Expression,
        templateExpression,
        sourceFile
      );

      return templateExpression;
    }

    const templateSpans = spans.map((span, index) => {
      const isLast = index === spans.length - 1;

      // tail이 빈 문자열이면 빈 문자열로 유지 (TypeScript는 빈 tail을 허용함)
      // 하지만 실제로는 호출하는 쪽에서 최소한 개행이라도 넣어주는 것이 안전
      const safeTail = span.tail;

      const templateSpan = this.factory.createTemplateSpan(
        span.expr,
        isLast
          ? this.factory.createTemplateTail(safeTail, safeTail)
          : this.factory.createTemplateMiddle(safeTail, safeTail)
      );

      return templateSpan;
    });

    const templateExpression = this.factory.createTemplateExpression(
      templateHead,
      templateSpans
    );

    // 디버깅: 최종 템플릿 확인
    const printer = ts.createPrinter();
    const sourceFile = ts.createSourceFile(
      "temp.ts",
      "",
      ts.ScriptTarget.Latest,
      true
    );
    const templateText = printer.printNode(
      ts.EmitHint.Expression,
      templateExpression,
      sourceFile
    );

    return templateExpression;
  }

  /**
   * 단순 템플릿 리터럴 생성 (보간 없음)
   * `content`
   */
  createSimpleTemplateLiteral(content: string): ts.TemplateExpression {
    return this.createTemplateLiteral(content, []);
  }

  /**
   * Tagged template expression 생성
   * tagName`template`
   */
  createTaggedTemplate(
    tagName: string,
    template: ts.TemplateExpression
  ): ts.TaggedTemplateExpression {
    return this.factory.createTaggedTemplateExpression(
      this.factory.createIdentifier(tagName),
      undefined,
      template
    );
  }

  /**
   * css`...` tagged template 생성
   * css`
   *   content
   * `
   */
  createCssTaggedTemplate(
    head: string,
    spans: Array<{ expr: ts.Expression; tail: string }> = []
  ): ts.TaggedTemplateExpression {
    // head 앞에 개행 추가하여 css` 다음에 줄바꿈이 오도록 함
    const formattedHead = "\n" + head;

    // spans가 비어있으면 보간 없는 템플릿 리터럴 사용 (${""}  방지)
    if (spans.length === 0) {
      const noSubstitutionTemplate =
        this.factory.createNoSubstitutionTemplateLiteral(formattedHead, formattedHead);
      return this.factory.createTaggedTemplateExpression(
        this.factory.createIdentifier("css"),
        undefined,
        noSubstitutionTemplate
      );
    }

    const template = this.createTemplateLiteral(formattedHead, spans);
    return this.createTaggedTemplate("css", template);
  }

  // ==================== Type Declarations ====================

  /**
   * Type alias 생성
   * type Name = Type;
   */
  createTypeAlias(
    name: string,
    type: ts.TypeNode,
    isExported: boolean = false
  ): ts.TypeAliasDeclaration {
    return this.factory.createTypeAliasDeclaration(
      isExported
        ? [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)]
        : undefined,
      this.factory.createIdentifier(name),
      undefined,
      type
    );
  }

  /**
   * Union type 생성
   * "A" | "B" | "C"
   */
  createUnionType(literals: Array<string | ts.TypeNode>): ts.UnionTypeNode {
    const typeNodes = literals.map((literal) =>
      typeof literal === "string"
        ? this.factory.createLiteralTypeNode(
            this.factory.createStringLiteral(literal)
          )
        : literal
    );
    return this.factory.createUnionTypeNode(typeNodes);
  }

  /**
   * String literal union type 생성
   * type Name = "A" | "B" | "C";
   */
  createStringLiteralUnionType(
    name: string,
    literals: string[],
    isExported: boolean = false
  ): ts.TypeAliasDeclaration {
    return this.createTypeAlias(
      name,
      this.createUnionType(literals),
      isExported
    );
  }

  // ==================== Interface Declarations ====================

  /**
   * Interface 선언 생성
   * interface Name extends ... { ... }
   */
  createInterface(
    name: string,
    members: ts.TypeElement[],
    extendsClauses?: ts.ExpressionWithTypeArguments[],
    isExported: boolean = false
  ): ts.InterfaceDeclaration {
    const heritageClauses = extendsClauses?.length
      ? [
          this.factory.createHeritageClause(
            ts.SyntaxKind.ExtendsKeyword,
            extendsClauses
          ),
        ]
      : undefined;

    return this.factory.createInterfaceDeclaration(
      isExported
        ? [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)]
        : undefined,
      this.factory.createIdentifier(name),
      undefined,
      heritageClauses,
      members
    );
  }

  /**
   * Property signature 생성
   * propName?: Type
   */
  createPropertySignature(
    name: string,
    type: ts.TypeNode,
    isOptional: boolean = false
  ): ts.PropertySignature {
    return this.factory.createPropertySignature(
      undefined,
      this.factory.createIdentifier(name),
      isOptional
        ? this.factory.createToken(ts.SyntaxKind.QuestionToken)
        : undefined,
      type
    );
  }

  // ==================== Property & Element Access ====================

  /**
   * Property access 생성
   * obj.prop
   */
  createPropertyAccess(
    object: string | ts.Expression,
    property: string
  ): ts.PropertyAccessExpression {
    const objectExpr =
      typeof object === "string"
        ? this.factory.createIdentifier(object)
        : object;
    return this.factory.createPropertyAccessExpression(
      objectExpr,
      this.factory.createIdentifier(property)
    );
  }

  /**
   * Qualified name 생성 (네임스페이스 접근)
   * React.ReactNode
   */
  createQualifiedName(left: string, right: string): ts.QualifiedName {
    return this.factory.createQualifiedName(
      this.factory.createIdentifier(left),
      this.factory.createIdentifier(right)
    );
  }

  /**
   * Element access 생성
   * obj[key]
   */
  createElementAccess(
    object: string | ts.Expression,
    key: string | ts.Expression
  ): ts.ElementAccessExpression {
    const objectExpr =
      typeof object === "string"
        ? this.factory.createIdentifier(object)
        : object;
    const keyExpr =
      typeof key === "string" ? this.factory.createStringLiteral(key) : key;

    const elementAccess = this.factory.createElementAccessExpression(
      objectExpr,
      keyExpr
    );

    // 디버깅: 생성된 Element access 확인
    const printer = ts.createPrinter();
    const sourceFile = ts.createSourceFile(
      "temp.ts",
      "",
      ts.ScriptTarget.Latest,
      true
    );
    const elementAccessText = printer.printNode(
      ts.EmitHint.Expression,
      elementAccess,
      sourceFile
    );

    return elementAccess;
  }

  // ==================== Object Literals ====================

  /**
   * Object literal 생성
   * { key1: value1, key2: value2 }
   */
  createObjectLiteral(
    properties: Array<{ key: string; value: ts.Expression }>
  ): ts.ObjectLiteralExpression {
    const objectProperties = properties.map((prop) =>
      this.factory.createPropertyAssignment(
        this.factory.createStringLiteral(prop.key),
        prop.value
      )
    );
    return this.factory.createObjectLiteralExpression(objectProperties, false);
  }

  /**
   * Record 타입 객체 생성
   * { Large: ..., Medium: ..., Small: ... }
   */
  createRecordObject(
    entries: Array<{ key: string; value: ts.Expression }>
  ): ts.ObjectLiteralExpression {
    return this.createObjectLiteral(entries);
  }

  // ==================== Import Statements ====================

  /**
   * Default import 생성
   * import Name from "module";
   */
  createDefaultImport(name: string, module: string): ts.ImportDeclaration {
    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        this.factory.createIdentifier(name),
        undefined
      ),
      this.factory.createStringLiteral(module)
    );
  }

  /**
   * Named import 생성
   * import { name1, name2 } from "module";
   */
  createNamedImport(names: string[], module: string): ts.ImportDeclaration {
    const importSpecifiers = names.map((name) =>
      this.factory.createImportSpecifier(
        false,
        undefined,
        this.factory.createIdentifier(name)
      )
    );

    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        undefined,
        this.factory.createNamedImports(importSpecifiers)
      ),
      this.factory.createStringLiteral(module)
    );
  }

  /**
   * Mixed import 생성 (default + named)
   * import Default, { named1, named2 } from "module";
   */
  createMixedImport(
    defaultName: string,
    namedNames: string[],
    module: string
  ): ts.ImportDeclaration {
    const importSpecifiers = namedNames.map((name) =>
      this.factory.createImportSpecifier(
        false,
        undefined,
        this.factory.createIdentifier(name)
      )
    );

    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        this.factory.createIdentifier(defaultName),
        this.factory.createNamedImports(importSpecifiers)
      ),
      this.factory.createStringLiteral(module)
    );
  }

  // ==================== Function Declarations ====================

  /**
   * Function declaration 생성
   * function name(params) { body }
   */
  createFunctionDeclaration(
    name: string,
    params: ts.ParameterDeclaration[],
    body: ts.Block,
    returnType?: ts.TypeNode,
    isExported: boolean = false,
    isDefault: boolean = false
  ): ts.FunctionDeclaration {
    const modifiers: ts.Modifier[] = [];
    if (isExported) {
      modifiers.push(this.factory.createModifier(ts.SyntaxKind.ExportKeyword));
    }
    if (isDefault) {
      modifiers.push(this.factory.createModifier(ts.SyntaxKind.DefaultKeyword));
    }

    return this.factory.createFunctionDeclaration(
      modifiers.length > 0 ? modifiers : undefined,
      undefined,
      this.factory.createIdentifier(name),
      undefined,
      params,
      returnType,
      body
    );
  }

  /**
   * export default function 생성
   * export default function name(params) { body }
   */
  createDefaultExportedFunction(
    name: string,
    params: ts.ParameterDeclaration[],
    body: ts.Block,
    returnType?: ts.TypeNode
  ): ts.FunctionDeclaration {
    return this.createFunctionDeclaration(
      name,
      params,
      body,
      returnType,
      true,
      true
    );
  }

  // ==================== Parameters ====================

  /**
   * Parameter declaration 생성
   * paramName: Type
   */
  createParameter(
    name: string,
    type?: ts.TypeNode,
    isOptional: boolean = false,
    initializer?: ts.Expression
  ): ts.ParameterDeclaration {
    return this.factory.createParameterDeclaration(
      undefined,
      undefined,
      this.factory.createIdentifier(name),
      isOptional
        ? this.factory.createToken(ts.SyntaxKind.QuestionToken)
        : undefined,
      type,
      initializer
    );
  }

  // ==================== Literals & Primitives ====================

  /**
   * String literal 생성
   */
  createStringLiteral(value: string): ts.StringLiteral {
    return this.factory.createStringLiteral(value);
  }

  /**
   * Number literal 생성
   */
  createNumericLiteral(value: number): ts.NumericLiteral {
    return this.factory.createNumericLiteral(value.toString());
  }

  /**
   * Boolean literal 생성
   */
  createBooleanLiteral(value: boolean): ts.BooleanLiteral {
    return value ? this.factory.createTrue() : this.factory.createFalse();
  }

  /**
   * Null literal 생성
   */
  createNull(): ts.NullLiteral {
    return this.factory.createNull();
  }

  /**
   * Identifier 생성
   */
  createIdentifier(name: string): ts.Identifier {
    return this.factory.createIdentifier(name);
  }

  // ==================== Type References ====================

  /**
   * Type reference 생성
   * TypeName
   */
  createTypeReference(
    typeName: string,
    typeArguments?: ts.TypeNode[]
  ): ts.TypeReferenceNode {
    return this.factory.createTypeReferenceNode(
      this.factory.createIdentifier(typeName),
      typeArguments
    );
  }

  /**
   * Qualified type reference 생성
   * React.ReactNode
   */
  createQualifiedTypeReference(
    namespace: string,
    typeName: string,
    typeArguments?: ts.TypeNode[]
  ): ts.TypeReferenceNode {
    return this.factory.createTypeReferenceNode(
      this.createQualifiedName(namespace, typeName),
      typeArguments
    );
  }

  /**
   * Indexed access type 생성
   * InterfaceName["propertyName"]
   */
  createIndexedAccessType(
    interfaceName: string,
    propertyName: string
  ): ts.IndexedAccessTypeNode {
    return this.factory.createIndexedAccessTypeNode(
      this.factory.createTypeReferenceNode(interfaceName),
      this.factory.createLiteralTypeNode(
        this.factory.createStringLiteral(propertyName)
      )
    );
  }

  /**
   * NonNullable indexed access type 생성
   * NonNullable<InterfaceName["propertyName"]>
   * optional prop에서 undefined를 제외한 타입
   */
  createNonNullableIndexedAccessType(
    interfaceName: string,
    propertyName: string
  ): ts.TypeReferenceNode {
    const indexedType = this.createIndexedAccessType(interfaceName, propertyName);
    return this.factory.createTypeReferenceNode("NonNullable", [indexedType]);
  }

  // ==================== Expressions ====================

  /**
   * Call expression 생성
   * func(args)
   */
  createCallExpression(
    expression: string | ts.Expression,
    args: ts.Expression[] = []
  ): ts.CallExpression {
    const expr =
      typeof expression === "string"
        ? this.factory.createIdentifier(expression)
        : expression;
    return this.factory.createCallExpression(expr, undefined, args);
  }

  /**
   * Binary expression 생성
   * left operator right
   */
  createBinaryExpression(
    left: ts.Expression,
    operator: ts.BinaryOperator,
    right: ts.Expression
  ): ts.BinaryExpression {
    return this.factory.createBinaryExpression(left, operator, right);
  }

  /**
   * Conditional expression 생성
   * condition ? trueExpr : falseExpr
   */
  createConditionalExpression(
    condition: ts.Expression,
    trueExpr: ts.Expression,
    falseExpr: ts.Expression
  ): ts.ConditionalExpression {
    return this.factory.createConditionalExpression(
      condition,
      this.factory.createToken(ts.SyntaxKind.QuestionToken),
      trueExpr,
      this.factory.createToken(ts.SyntaxKind.ColonToken),
      falseExpr
    );
  }

  /**
   * Return statement 생성
   * return expr;
   */
  createReturnStatement(expression?: ts.Expression): ts.ReturnStatement {
    return this.factory.createReturnStatement(expression);
  }

  // ==================== Escape Hatch: Parsing ====================

  /**
   * 코드 문자열을 파싱하여 Statement 추출
   * 복잡한 노드를 factory로 만들기 어려울 때 사용
   */
  parseStatement(code: string): ts.Statement {
    const sourceFile = ts.createSourceFile(
      "temp.ts",
      code,
      ts.ScriptTarget.Latest,
      true
    );

    if (sourceFile.statements.length === 0) {
      throw new Error("No statement found in parsed code");
    }

    return sourceFile.statements[0];
  }

  /**
   * 코드 문자열을 파싱하여 Expression 추출
   * 복잡한 표현식을 factory로 만들기 어려울 때 사용
   */
  parseExpression(code: string): ts.Expression {
    // 표현식을 추출하기 위해 임시 변수 선언으로 감싸서 파싱
    const wrappedCode = `const _temp = ${code};`;
    const sourceFile = ts.createSourceFile(
      "temp.ts",
      wrappedCode,
      ts.ScriptTarget.Latest,
      true
    );

    const statement = sourceFile.statements[0];
    if (!ts.isVariableStatement(statement)) {
      throw new Error("Failed to parse expression");
    }

    const declaration = statement.declarationList.declarations[0];
    if (!declaration.initializer) {
      throw new Error("No initializer found in parsed expression");
    }

    return declaration.initializer;
  }

  /**
   * 여러 Statement를 파싱
   */
  parseStatements(code: string): ts.Statement[] {
    const sourceFile = ts.createSourceFile(
      "temp.ts",
      code,
      ts.ScriptTarget.Latest,
      true
    );
    return [...sourceFile.statements];
  }

  // ==================== Type Annotations ====================

  /**
   * satisfies 타입 어노테이션을 위한 AsExpression 생성
   * expr satisfies Type
   */
  createSatisfiesExpression(
    expression: ts.Expression,
    type: ts.TypeNode
  ): ts.AsExpression {
    return this.factory.createAsExpression(expression, type);
  }

  /**
   * as const 타입 어노테이션 생성
   * expr as const
   */
  createAsConstExpression(expression: ts.Expression): ts.AsExpression {
    return this.factory.createAsExpression(
      expression,
      this.factory.createTypeReferenceNode(
        this.factory.createIdentifier("const"),
        undefined
      )
    );
  }

  /**
   * satisfies + as const 조합
   * expr as const satisfies Type
   */
  createAsConstSatisfiesExpression(
    expression: ts.Expression,
    type: ts.TypeNode
  ): ts.AsExpression {
    // TypeScript에서는 as const satisfies Type을 직접 지원하지 않으므로
    // satisfies를 우선 사용 (실제로는 satisfies가 더 강력함)
    return this.createSatisfiesExpression(expression, type);
  }
}

export default TypescriptNodeKitManager;
