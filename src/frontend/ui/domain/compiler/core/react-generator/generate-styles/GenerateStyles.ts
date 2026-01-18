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
  /** 루트 노드에 사용할 컴포넌트 이름 (외부에서 전달) */
  private componentName: string | undefined;
  /** CSS 내용 중복 제거용 Map (정규화된 CSS 키 → 변수명) */
  private cssContentMap: Map<string, string> = new Map();

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
   * 노드의 기본 이름 가져오기
   * - 루트: 외부에서 전달된 componentName 우선, 없으면 문서 이름 사용
   * - 숫자만 있는 이름: semanticRole 사용 (text, button 등)
   * - 그 외: 노드 이름 사용
   */
  private _getNodeBaseName(node: FinalAstTree): string {
    // 루트 노드: componentName 우선 사용 (variant 이름 대신 컴포넌트 이름)
    if (!node.parent) {
      if (this.componentName) {
        return this.componentName;
      }
      if (node.metaData.document) {
        return node.metaData.document.name;
      }
    }

    // 노드 이름이 숫자만 있으면 semanticRole 사용
    const isNumericOnly = /^[0-9]+$/.test(node.name);
    if (isNumericOnly && node.semanticRole) {
      // semanticRole이 container면 부모 이름 + role 조합
      if (node.semanticRole === "container" && node.parent) {
        const parentName = this._getNodeBaseName(node.parent);
        return `${parentName}Child`;
      }
      return node.semanticRole;
    }

    return node.name;
  }

  public createStyleVariables(componentName?: string): ts.VariableStatement[] {
    // 외부에서 전달된 컴포넌트 이름 저장 (루트 노드 CSS 이름에 사용)
    this.componentName = componentName;
    const styleVariables: ts.VariableStatement[] = [];

    traverseBFS(this.astTree, (node) => {
      // Slot 노드는 CSS 생성 스킵 (사용자가 전달하는 컴포넌트이므로)
      if ((node as any).isSlot) {
        return;
      }

      // 외부 컴포넌트(INSTANCE)도 레이아웃 스타일이 필요할 수 있으므로 CSS 생성
      // (부모 레이아웃에서의 배치: flex-shrink, margin 등)

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
   * 예: const btnSizeStyles = { L: { padding: "8px" }, ... }
   * Boolean prop은 Record 대신 삼항 연산자로 처리하므로 제외
   * 모든 가능한 variant 값을 포함하여 타입 안전성 보장
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

      const nodeName = this._getNodeBaseName(node);
      // 변수명 생성: btnSizeStyles (중복 시 btnSizeStyles_2)
      const baseName = `${normalizeName(nodeName)}${capitalize(propName)}Styles`;
      const varName = this._generateUniqueVarName(baseName);

      // AST에 Record 변수명 저장
      if (node.generatedNames) {
        node.generatedNames.recordVarNames[propName] = varName;
      }

      // 모든 가능한 variant 값 가져오기 (타입 안전성을 위해)
      const allOptions = (propDef as any)?.variantOptions || [];

      // Record 객체 생성: 모든 옵션에 대해 스타일 또는 빈 객체 할당
      const recordEntries = allOptions.map((option: string) => {
        const existingVariant = variants.find((v) => v.value === option);
        return {
          key: option,
          value: existingVariant
            ? this._styleObjectToExpression(existingVariant.style)
            : this._styleObjectToExpression({}), // 스타일 없으면 빈 객체
        };
      });

      // options가 없는 경우 fallback (기존 동작 유지)
      if (recordEntries.length === 0) {
        variants.forEach((variant) => {
          recordEntries.push({
            key: variant.value,
            value: this._styleObjectToExpression(variant.style),
          });
        });
      }

      const recordObject = this.kit.createRecordObject(recordEntries);
      const recordVar = this.kit.createConstVariable(varName, recordObject);
      statements.push(recordVar);
    }

    return statements;
  }

  /**
   * CSS 함수 생성
   * 예: const primaryButtonCss = ($size: Size) => css`...`
   * 동일한 CSS 내용이 있으면 기존 변수명을 재사용하여 중복 제거
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

    // 파라미터 시그니처 수집 (중복 체크 키에 사용)
    const paramSignatures: string[] = [];

    for (const [propName] of grouped.entries()) {
      // NonNullable IndexedAccessType 사용: NonNullable<ComponentProps["propName"]>
      // optional prop에서 undefined를 제외하여 인덱싱 타입 에러 방지
      const indexedType = this.kit.createNonNullableIndexedAccessType(
        propsInterfaceName,
        propName
      );

      // 기본값은 컴포넌트의 props 구조분해에서 관리하므로 CSS 함수에서는 제거
      const param = this.kit.createParameter(
        `$${propName}`,
        indexedType,
        false,
        undefined // 기본값 없음
      );
      params.push(param);
      paramSignatures.push(propName);
    }

    // 2. CSS 템플릿 내용 생성 (중복 체크를 위해 먼저 계산)
    let cssHead = "";

    // Base 스타일
    if (hasBaseStyle) {
      cssHead = this._styleObjectToCssString(node.style.base || {});
      if (cssHead && (hasDynamicStyle || hasPseudoStyle)) {
        if (!cssHead.endsWith("\n")) {
          cssHead += "\n";
        }
      }
    }

    // Pseudo 스타일 (동적 스타일이 없을 때만 head에 포함)
    let pseudoCss = "";
    if (hasPseudoStyle) {
      pseudoCss = this._pseudoStyleToCssString(node.style.pseudo || {});
      if (!hasDynamicStyle) {
        cssHead = cssHead ? cssHead + "\n" + pseudoCss : pseudoCss;
      }
    }

    // 3. 중복 체크 키 생성 (파라미터 시그니처 + CSS 내용)
    const cssContentKey = this._generateCssContentKey(
      paramSignatures,
      cssHead,
      hasDynamicStyle ? grouped : null,
      hasPseudoStyle && hasDynamicStyle ? pseudoCss : ""
    );

    // 4. 중복 체크: 동일한 CSS가 이미 있으면 기존 변수명 재사용
    const existingVarName = this.cssContentMap.get(cssContentKey);
    if (existingVarName) {
      // AST에 기존 CSS 변수명 저장
      if (node.generatedNames) {
        node.generatedNames.cssVarName = existingVarName;
      }
      return null; // 새 변수 생성하지 않음
    }

    // 5. 새 CSS - Dynamic 스타일 보간 추가
    const templateSpans: Array<{ expr: ts.Expression; tail: string }> = [];

    if (hasDynamicStyle) {
      for (const [propName, variants] of grouped.entries()) {
        const propDef = this.astTree.props[propName];
        const isBooleanProp = propDef?.type === "BOOLEAN";

        let expr: ts.Expression;

        if (isBooleanProp) {
          const paramIdentifier = this.kit.createIdentifier(`$${propName}`);

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
          const recordVarName =
            node.generatedNames?.recordVarNames[propName] ||
            `${propName}Styles`;
          const indexExpression = this.kit.createIdentifier(`$${propName}`);
          expr = this.kit.createElementAccess(recordVarName, indexExpression);
        }

        const tail = hasPseudoStyle ? "\n\n" : "\n";
        templateSpans.push({
          expr,
          tail,
        });
      }
    }

    // Pseudo 스타일 추가 (동적 스타일이 있을 때)
    if (hasPseudoStyle && hasDynamicStyle && templateSpans.length > 0) {
      const lastSpan = templateSpans[templateSpans.length - 1];
      lastSpan.tail = lastSpan.tail + pseudoCss;
    }

    // 6. CSS tagged template 생성
    const finalHead = cssHead || " ";

    const taggedTemplate = this.kit.createCssTaggedTemplate(
      finalHead,
      templateSpans
    );

    // 7. 화살표 함수 생성
    const arrowFunction =
      params.length > 0
        ? this.kit.createArrowFunction(params, taggedTemplate)
        : taggedTemplate;

    // 8. const 변수 선언
    const nodeName = this._getNodeBaseName(node);
    const baseCssName = `${normalizeName(nodeName)}Css`;
    const cssVarName = this._generateUniqueVarName(baseCssName);

    // AST에 CSS 변수명 저장
    if (node.generatedNames) {
      node.generatedNames.cssVarName = cssVarName;
    }

    // 중복 체크 맵에 저장
    this.cssContentMap.set(cssContentKey, cssVarName);

    return this.kit.createConstVariable(cssVarName, arrowFunction);
  }

  /**
   * CSS 중복 체크를 위한 정규화된 키 생성
   * 파라미터 시그니처 + CSS 내용을 결합
   */
  private _generateCssContentKey(
    paramSignatures: string[],
    cssHead: string,
    dynamicGroups: Map<
      string,
      Array<{ value: string; style: Record<string, any> }>
    > | null,
    pseudoCss: string
  ): string {
    const parts: string[] = [];

    // 파라미터 시그니처
    parts.push(`params:[${paramSignatures.sort().join(",")}]`);

    // Base CSS (정규화: 공백 통일)
    parts.push(`base:${this._normalizeCssForComparison(cssHead)}`);

    // Dynamic 스타일 (Record 변수명이 아닌 실제 스타일 내용으로 비교)
    if (dynamicGroups) {
      const dynamicParts: string[] = [];
      for (const [propName, variants] of dynamicGroups.entries()) {
        const variantStrs = variants
          .map((v) => `${v.value}:${JSON.stringify(v.style)}`)
          .sort()
          .join("|");
        dynamicParts.push(`${propName}={${variantStrs}}`);
      }
      parts.push(`dynamic:[${dynamicParts.sort().join(",")}]`);
    }

    // Pseudo CSS
    if (pseudoCss) {
      parts.push(`pseudo:${this._normalizeCssForComparison(pseudoCss)}`);
    }

    return parts.join("||");
  }

  /**
   * CSS 문자열 정규화 (비교용)
   * 공백, 줄바꿈 등을 통일하여 동일한 스타일이 다르게 인식되는 것을 방지
   */
  private _normalizeCssForComparison(css: string): string {
    return css
      .replace(/\s+/g, " ") // 모든 공백을 단일 공백으로
      .replace(/;\s*/g, ";") // 세미콜론 뒤 공백 제거
      .replace(/:\s*/g, ":") // 콜론 뒤 공백 제거
      .replace(/{\s*/g, "{") // 중괄호 뒤 공백 제거
      .replace(/\s*}/g, "}") // 중괄호 앞 공백 제거
      .trim();
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
   *
   * - :hover, :active는 :not(:disabled)로 감싸서 disabled 상태에서 적용되지 않도록 함
   * - 순서 중요: hover → focus → active → disabled (클릭 시 active가 hover를 덮어씀)
   */
  private _pseudoStyleToCssString(
    pseudo: Record<string, Record<string, any>>
  ): string {
    // :disabled가 있는지 확인
    const hasDisabled = ":disabled" in pseudo;

    // CSS 우선순위에 맞게 정렬 (LVHFA: Link, Visited, Hover, Focus, Active)
    const pseudoOrder = [":hover", ":focus", ":active", ":disabled"];
    const sortedEntries = Object.entries(pseudo).sort(([a], [b]) => {
      const indexA = pseudoOrder.indexOf(a);
      const indexB = pseudoOrder.indexOf(b);
      // 목록에 없으면 맨 앞으로
      if (indexA === -1) return -1;
      if (indexB === -1) return 1;
      return indexA - indexB;
    });

    return sortedEntries
      .map(([pseudoClass, styles]) => {
        const cssContent = this._styleObjectToCssString(styles);

        // :hover, :active는 disabled 상태에서 적용되면 안됨
        let finalPseudoClass = pseudoClass;
        if (
          hasDisabled &&
          (pseudoClass === ":hover" || pseudoClass === ":active")
        ) {
          finalPseudoClass = `&:not(:disabled)${pseudoClass}`;
        }

        return `\n  ${finalPseudoClass} {\n${cssContent}\n  }`;
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
