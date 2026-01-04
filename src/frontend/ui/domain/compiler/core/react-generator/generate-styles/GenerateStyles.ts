import ts, { NodeFactory } from "typescript";
import { traverseBFS } from "@compiler/utils/traverse";
import { FinalAstTree } from "../../../types/customType";
import TypescriptNodeKitManager from "../../../manager/TypescriptNodeKitManager";
import { toCamelCase } from "@compiler/utils/normalizeString";
import { capitalize, normalizeName } from "@compiler/utils/stringUtils";

class GenerateStyles {
  private factory: NodeFactory;
  private astTree: FinalAstTree;
  private kit: TypescriptNodeKitManager;
  /** 변수명 중복 추적용 Map (baseName → 사용 횟수) */
  private usedNames: Map<string, number> = new Map();

  constructor(factory: NodeFactory, astTree: FinalAstTree) {
    this.factory = factory;
    this.astTree = astTree;
    this.kit = new TypescriptNodeKitManager(this.factory);
  }

  /**
   * 중복을 피하는 고유한 변수명 생성
   * 첫 번째는 suffix 없이, 두 번째부터 _2, _3...
   */
  private _generateUniqueVarName(baseName: string): string {
    const count = this.usedNames.get(baseName) || 0;
    this.usedNames.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  }

  /**
   * 노드의 기본 이름 가져오기 (루트는 문서 이름 사용)
   */
  private _getNodeBaseName(node: FinalAstTree): string {
    if (!node.parent && node.metaData.document) {
      return node.metaData.document.name;
    }
    return node.name;
  }

  public createStyleVariables(): ts.VariableStatement[] {
    const styleVariables: ts.VariableStatement[] = [];

    traverseBFS(this.astTree, (node) => {
      // 스타일이 없는 노드는 스킵
      const hasBaseStyle =
        node.style.base && Object.keys(node.style.base).length > 0;
      const hasDynamicStyle =
        node.style.dynamic && node.style.dynamic.length > 0;
      const hasPseudoStyle =
        node.style.pseudo && Object.keys(node.style.pseudo).length > 0;

      if (!hasBaseStyle && !hasDynamicStyle && !hasPseudoStyle) {
        return;
      }

      // generatedNames 초기화
      node.generatedNames = {
        cssVarName: "",
        recordVarNames: {},
      };

      // 1. Dynamic 스타일에서 Record 객체 생성 (variant map)
      if (hasDynamicStyle) {
        const recordVars = this._createRecordObjects(node);
        styleVariables.push(...recordVars);
      }

      // 2. CSS 함수 생성
      const cssVar = this._createCssFunction(node);
      if (cssVar) {
        styleVariables.push(cssVar);
      }
    });

    return styleVariables;
  }

  /**
   * Dynamic styles를 prop별로 그룹화하여 Record 객체 생성
   * 예: const primaryButtonBySize = { Large: { padding: "8px" }, ... }
   * Boolean prop은 Record 대신 삼항 연산자로 처리하므로 제외
   */
  private _createRecordObjects(node: FinalAstTree): ts.VariableStatement[] {
    const statements: ts.VariableStatement[] = [];
    const grouped = this._groupDynamicStylesByProp(node.style.dynamic || []);

    for (const [propName, variants] of grouped.entries()) {
      // Boolean prop은 Record 객체를 생성하지 않음 (삼항 연산자로 직접 처리)
      const propDef = this.astTree.props[propName];
      if (propDef?.type === "BOOLEAN") {
        continue;
      }

      let nodeName = node.name;

      if (!node.parent && node.metaData.document) {
        nodeName = node.metaData.document.name;
      }

      const varName = `${normalizeName(nodeName)}By${capitalize(propName)}_${normalizeName(node.id)}`;

      // Record 객체 생성: { Large: { padding: "8px" }, ... }
      const recordEntries = variants.map((variant) => ({
        key: variant.value,
        value: this._styleObjectToExpression(variant.style),
      }));

      const recordObject = this.kit.createRecordObject(recordEntries);
      const recordVar = this.kit.createConstVariable(varName, recordObject);
      statements.push(recordVar);
    }

    return statements;
  }

  /**
   * CSS 함수 생성
   * 예: const primaryButtonCss = ($size: Size) => css`...`
   */
  private _createCssFunction(node: FinalAstTree): ts.VariableStatement | null {
    const hasBaseStyle =
      node.style.base && Object.keys(node.style.base).length > 0;
    const hasDynamicStyle = node.style.dynamic && node.style.dynamic.length > 0;
    const hasPseudoStyle =
      node.style.pseudo && Object.keys(node.style.pseudo).length > 0;

    if (!hasBaseStyle && !hasDynamicStyle && !hasPseudoStyle) {
      return null;
    }

    // 1. 파라미터 생성 (dynamic이 있으면 prop 파라미터 추가)
    const params: ts.ParameterDeclaration[] = [];
    const grouped = hasDynamicStyle
      ? this._groupDynamicStylesByProp(node.style.dynamic || [])
      : new Map();

    // 루트 컴포넌트의 Props 인터페이스 이름 사용 (모든 노드에서 동일)
    const rootComponentName =
      this.astTree.metaData.document?.name || this.astTree.name;
    // PascalCase로 변환하여 인터페이스 이름과 일치시킴 (btn → Btn → BtnProps)
    const propsInterfaceName = `${capitalize(normalizeName(rootComponentName))}Props`;

    for (const [propName] of grouped.entries()) {
      // IndexedAccessType 사용: ComponentProps["propName"]
      const indexedType = this.kit.createIndexedAccessType(
        propsInterfaceName,
        propName
      );

      // 기본값 가져오기
      const propDef = this.astTree.props[propName];
      let initializer: ts.Expression | undefined;

      if (propDef?.defaultValue !== undefined) {
        if (propDef.type === "BOOLEAN") {
          initializer =
            propDef.defaultValue === true
              ? this.factory.createTrue()
              : this.factory.createFalse();
        } else if (typeof propDef.defaultValue === "string") {
          initializer = this.factory.createStringLiteral(propDef.defaultValue);
        } else if (typeof propDef.defaultValue === "number") {
          initializer = this.factory.createNumericLiteral(propDef.defaultValue);
        }
      }

      const param = this.kit.createParameter(
        `$${propName}`,
        indexedType,
        false,
        initializer
      );
      params.push(param);
    }

    // 2. CSS 템플릿 생성
    const templateSpans: Array<{ expr: ts.Expression; tail: string }> = [];
    let cssHead = "";

    // Base 스타일
    if (hasBaseStyle) {
      cssHead = this._styleObjectToCssString(node.style.base || {});
      // cssHead 끝에 개행 추가 (템플릿 보간 전에 빈 줄을 위해)
      // 단, cssHead가 비어있지 않을 때만 추가
      if (cssHead && (hasDynamicStyle || hasPseudoStyle)) {
        // cssHead가 이미 개행으로 끝나지 않으면 추가
        if (!cssHead.endsWith("\n")) {
          cssHead += "\n";
        }
      }
    }

    // Dynamic 스타일 보간 추가
    // 예: ${paddingBySize[$size]} 형태로 객체를 직접 보간
    // Boolean prop은 삼항 연산자로 직접 스타일 객체를 보간
    if (hasDynamicStyle) {
      for (const [propName, variants] of grouped.entries()) {
        // Boolean prop인지 확인 (루트의 props에서 타입 체크)
        const propDef = this.astTree.props[propName];
        const isBooleanProp = propDef?.type === "BOOLEAN";

        let expr: ts.Expression;

        if (isBooleanProp) {
          // Boolean prop: 삼항 연산자로 직접 스타일 객체 생성
          // $customDisabled ? { background: "..." } : { background: "..." }
          const paramIdentifier = this.kit.createIdentifier(`$${propName}`);

          // True/False 스타일 찾기
          const trueVariant = variants.find(
            (v: { value: string; style: Record<string, any> }) =>
              v.value === "True"
          );
          const falseVariant = variants.find(
            (v: { value: string; style: Record<string, any> }) =>
              v.value === "False"
          );

          const trueStyle = trueVariant
            ? this._styleObjectToExpression(trueVariant.style)
            : this.factory.createObjectLiteralExpression([]);
          const falseStyle = falseVariant
            ? this._styleObjectToExpression(falseVariant.style)
            : this.factory.createObjectLiteralExpression([]);

          expr = this.factory.createConditionalExpression(
            paramIdentifier,
            undefined,
            trueStyle,
            undefined,
            falseStyle
          );
        } else {
          // 일반 prop: Record 객체 인덱싱
          let nodeName = node.name;
          if (!node.parent && node.metaData.document) {
            nodeName = node.metaData.document.name;
          }
          const recordVarName = `${normalizeName(nodeName)}By${capitalize(propName)}_${normalizeName(node.id)}`;
          const indexExpression = this.kit.createIdentifier(`$${propName}`);
          expr = this.kit.createElementAccess(recordVarName, indexExpression);
        }

        // 객체를 직접 보간 (emotion이 CSS로 변환)
        // tail은 최소한 개행이라도 있어야 함 (빈 문자열이면 문제 발생)
        const tail = hasPseudoStyle ? "\n\n" : "\n";
        templateSpans.push({
          expr,
          tail,
        });
      }
    }

    // Pseudo 스타일 추가
    if (hasPseudoStyle) {
      const pseudoCss = this._pseudoStyleToCssString(node.style.pseudo || {});
      if (templateSpans.length > 0) {
        // 마지막 span의 tail에 pseudo 스타일 추가
        const lastSpan = templateSpans[templateSpans.length - 1];
        lastSpan.tail = lastSpan.tail + pseudoCss;
      } else {
        // 보간이 없으면 head에 추가
        cssHead = cssHead ? cssHead + "\n" + pseudoCss : pseudoCss;
      }
    }

    // 3. CSS tagged template 생성
    // cssHead가 비어있고 spans도 비어있으면 최소한의 공백이라도 넣어야 함
    const finalHead = cssHead || " ";

    const taggedTemplate = this.kit.createCssTaggedTemplate(
      finalHead,
      templateSpans
    );

    // 4. 화살표 함수 생성
    const arrowFunction =
      params.length > 0
        ? this.kit.createArrowFunction(params, taggedTemplate)
        : taggedTemplate;

    let nodeName = node.name;

    if (!node.parent && node.metaData.document) {
      nodeName = node.metaData.document.name;
    }
    // 5. const 변수 선언
    // node.id를 추가하여 중복 방지
    const cssVarName = `${normalizeName(nodeName)}Css_${normalizeName(node.id)}`;
    return this.kit.createConstVariable(cssVarName, arrowFunction);
  }

  /**
   * Dynamic styles를 prop별로 그룹핑
   */
  private _groupDynamicStylesByProp(
    dynamicStyles: Array<{ condition: any; style: Record<string, any> }>
  ): Map<string, Array<{ value: string; style: Record<string, any> }>> {
    const grouped = new Map<
      string,
      Array<{ value: string; style: Record<string, any> }>
    >();

    for (const dynamicStyle of dynamicStyles) {
      const extracted = this._extractPropAndValue(dynamicStyle.condition);
      if (!extracted) continue; // 추출 불가능한 조건은 스킵

      if (!grouped.has(extracted.prop)) {
        grouped.set(extracted.prop, []);
      }

      const propVariants = grouped.get(extracted.prop)!;
      // 같은 value가 이미 있으면 스타일 병합, 없으면 새로 추가
      const existingVariant = propVariants.find(
        (v) => v.value === extracted.value
      );
      if (existingVariant) {
        // 스타일 병합 (기존 스타일에 새 스타일 덮어쓰기)
        existingVariant.style = {
          ...existingVariant.style,
          ...dynamicStyle.style,
        };
      } else {
        propVariants.push({
          value: extracted.value,
          style: dynamicStyle.style,
        });
      }
    }

    return grouped;
  }

  /**
   * ESTree 조건에서 prop 이름과 값 추출
   * props.Size === "Large" → { prop: "size", value: "Large" }
   */
  private _extractPropAndValue(condition: any): {
    prop: string;
    value: string;
  } | null {
    if (!condition || condition.type !== "BinaryExpression") {
      return null;
    }

    // props.X === "value" 형태만 처리
    if (
      condition.operator === "===" &&
      condition.left?.type === "MemberExpression" &&
      condition.left.object?.name === "props" &&
      condition.right?.type === "Literal"
    ) {
      const propName = condition.left.property?.name;
      const propValue = condition.right.value;

      if (propName && propValue !== undefined) {
        // prop 이름을 camelCase로 변환 (예: "Size" → "size")
        const camelPropName =
          propName.charAt(0).toLowerCase() + propName.slice(1);
        return {
          prop: camelPropName,
          value: String(propValue),
        };
      }
    }

    return null;
  }

  /**
   * 스타일 객체를 CSS 문자열로 변환
   */
  private _styleObjectToCssString(style: Record<string, any>): string {
    return Object.entries(style)
      .map(([key, value]) => {
        const cssKey = this._camelToKebab(key);
        return `  ${cssKey}: ${this._formatCssValue(value)};`;
      })
      .join("\n");
  }

  /**
   * Pseudo 스타일을 CSS 문자열로 변환
   */
  private _pseudoStyleToCssString(
    pseudo: Record<string, Record<string, any>>
  ): string {
    return Object.entries(pseudo)
      .map(([pseudoClass, styles]) => {
        const cssContent = this._styleObjectToCssString(styles);
        return `\n  ${pseudoClass} {\n${cssContent}\n  }`;
      })
      .join("");
  }

  /**
   * 스타일 객체를 TypeScript Expression으로 변환
   */
  private _styleObjectToExpression(
    style: Record<string, any>
  ): ts.ObjectLiteralExpression {
    const objectProperties = Object.entries(style).map(([key, value]) => {
      // 하이픈이나 특수문자가 포함된 키는 문자열 리터럴로 처리
      const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
      const propertyName: ts.PropertyName = isValidIdentifier
        ? this.factory.createIdentifier(toCamelCase(key))
        : this.factory.createStringLiteral(toCamelCase(key));

      return this.factory.createPropertyAssignment(
        propertyName,
        this._valueToExpression(value)
      );
    });

    return this.factory.createObjectLiteralExpression(objectProperties, false);
  }

  /**
   * 값을 TypeScript Expression으로 변환
   */
  private _valueToExpression(value: any): ts.Expression {
    if (typeof value === "string") {
      // CSS 주석 제거 (/* ... */ 형태)
      const cleanedValue = value.replace(/\/\*[\s\S]*?\*\//g, "").trim();
      return this.kit.createStringLiteral(cleanedValue);
    }
    if (typeof value === "number") {
      return this.kit.createNumericLiteral(value);
    }
    if (typeof value === "boolean") {
      return this.kit.createBooleanLiteral(value);
    }
    if (value === null || value === undefined) {
      return this.kit.createNull();
    }
    // 객체나 배열인 경우
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        // 배열은 간단히 처리 (필요시 확장)
        return this.kit.createNull();
      }
      // 중첩 객체
      const properties = Object.entries(value).map(([key, val]) => ({
        key,
        value: this._valueToExpression(val),
      }));
      return this.kit.createObjectLiteral(properties);
    }
    return this.kit.createNull();
  }

  /**
   * CSS 값 포맷팅
   */
  private _formatCssValue(value: any): string {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return `${value}px`;
    }
    return String(value);
  }

  /**
   * camelCase를 kebab-case로 변환
   */
  private _camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }
}

export default GenerateStyles;
