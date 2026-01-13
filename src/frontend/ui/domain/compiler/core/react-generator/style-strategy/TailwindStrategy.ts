import ts from "typescript";
import { FinalAstTree } from "@compiler";
import { StyleStrategy, DynamicStyleInfo } from "./StyleStrategy";
import { CssToTailwindTranslator } from "css-to-tailwind-translator";
import { traverseBFS } from "@compiler/utils/traverse";
import { capitalize, normalizeName } from "@compiler/utils/stringUtils";

/**
 * Tailwind CSS 전략
 * CSS 속성을 Tailwind 유틸리티 클래스로 변환
 */
class TailwindStrategy implements StyleStrategy {
  readonly name = "tailwind" as const;

  private factory: ts.NodeFactory;
  private astTree: FinalAstTree;
  private cnImportPath?: string;
  private inlineCn: boolean;

  /** 노드별 Tailwind 클래스 캐시 */
  private classCache: Map<string, string> = new Map();
  /** 동적 스타일 클래스 맵 (nodeId → prop → value → classes) */
  private dynamicClassMaps: Map<string, Map<string, Map<string, string>>> =
    new Map();
  /** 노드별 생성된 변수명 저장 (nodeId → propName → varName) */
  private nodeClassVarNames: Map<string, Map<string, string>> = new Map();
  /** 변수명 중복 추적용 Map (baseName → 사용 횟수) */
  private usedNames: Map<string, number> = new Map();
  /** 컴포넌트 이름 (루트 노드용) */
  private componentName: string | undefined;

  constructor(
    factory: ts.NodeFactory,
    astTree: FinalAstTree,
    options?: { cnImportPath?: string; inlineCn?: boolean }
  ) {
    this.factory = factory;
    this.astTree = astTree;
    this.cnImportPath = options?.cnImportPath;
    // 기본값: inlineCn = true (의존성 없이 동작)
    this.inlineCn = options?.inlineCn ?? true;

    // 모든 노드의 스타일을 미리 변환
    this._preprocessStyles();
  }

  /**
   * Tailwind import 문 생성
   * inlineCn이 true면 import 없음 (cn 함수를 인라인으로 생성)
   * inlineCn이 false면 import { cn } from 'cnImportPath'
   */
  generateImports(): ts.ImportDeclaration[] {
    // 인라인 cn 사용 시 import 없음
    if (this.inlineCn) {
      return [];
    }

    // 외부 cn import
    return [
      this.factory.createImportDeclaration(
        undefined,
        this.factory.createImportClause(
          false,
          undefined,
          this.factory.createNamedImports([
            this.factory.createImportSpecifier(
              false,
              undefined,
              this.factory.createIdentifier("cn")
            ),
          ])
        ),
        this.factory.createStringLiteral(this.cnImportPath || "@/lib/utils")
      ),
    ];
  }

  /**
   * 스타일 선언부 생성
   * - inlineCn이 true면 cn 함수를 인라인으로 생성
   * - 노드별 동적 스타일용 클래스 맵 생성 (Emotion과 동일한 패턴)
   */
  generateDeclarations(
    _astTree: FinalAstTree,
    componentName: string
  ): ts.Statement[] {
    this.componentName = componentName;
    const statements: ts.Statement[] = [];

    // 인라인 cn 함수 생성
    if (this.inlineCn) {
      statements.push(this._createInlineCnFunction());
    }

    // 노드별로 클래스 맵 변수 생성 (Emotion의 _createRecordObjects와 동일한 패턴)
    traverseBFS(this.astTree, (node) => {
      const propMaps = this.dynamicClassMaps.get(node.id);
      if (!propMaps || propMaps.size === 0) {
        return;
      }

      // 노드별 변수명 맵 초기화
      if (!this.nodeClassVarNames.has(node.id)) {
        this.nodeClassVarNames.set(node.id, new Map());
      }
      const nodeVarNames = this.nodeClassVarNames.get(node.id)!;

      for (const [propName, valueMap] of propMaps.entries()) {
        const properties: ts.PropertyAssignment[] = [];

        // 모든 가능한 variant 값 가져오기 (타입 안전성을 위해)
        const propDef = this.astTree.props[propName];
        const allOptions = (propDef as any)?.variantOptions || [];

        // 모든 옵션에 대해 클래스 할당 (없으면 빈 문자열)
        if (allOptions.length > 0) {
          for (const option of allOptions) {
            const classes = valueMap.get(option) || "";
            properties.push(
              this.factory.createPropertyAssignment(
                this.factory.createStringLiteral(option),
                this.factory.createStringLiteral(classes)
              )
            );
          }
        } else {
          // variantOptions가 없는 경우 기존 값 사용
          for (const [value, classes] of valueMap.entries()) {
            properties.push(
              this.factory.createPropertyAssignment(
                this.factory.createStringLiteral(value),
                this.factory.createStringLiteral(classes)
              )
            );
          }
        }

        // 노드별 고유 변수명 생성 (예: ButtonSizeClasses, LabelSizeClasses)
        const nodeName = this._getNodeBaseName(node);
        const baseName = `${normalizeName(nodeName)}${capitalize(propName)}Classes`;
        const varName = this._generateUniqueVarName(baseName);

        // 변수명 저장
        nodeVarNames.set(propName, varName);

        const objectLiteral = this.factory.createObjectLiteralExpression(
          properties,
          true
        );

        statements.push(
          this.factory.createVariableStatement(
            undefined,
            this.factory.createVariableDeclarationList(
              [
                this.factory.createVariableDeclaration(
                  varName,
                  undefined,
                  undefined,
                  objectLiteral
                ),
              ],
              ts.NodeFlags.Const
            )
          )
        );
      }
    });

    return statements;
  }

  /**
   * 노드의 기본 이름 가져오기 (Emotion의 _getNodeBaseName과 동일)
   */
  private _getNodeBaseName(node: FinalAstTree): string {
    // 루트 노드: componentName 우선 사용
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
      if (node.semanticRole === "container" && node.parent) {
        const parentName = this._getNodeBaseName(node.parent);
        return `${parentName}Child`;
      }
      return node.semanticRole;
    }

    return node.name;
  }

  /**
   * 중복을 피하는 고유한 변수명 생성
   */
  private _generateUniqueVarName(baseName: string): string {
    const count = this.usedNames.get(baseName) || 0;
    this.usedNames.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  }

  /**
   * className 속성 생성
   */
  createStyleAttribute(node: FinalAstTree): ts.JsxAttribute | null {
    const baseClasses = this.classCache.get(node.id) || "";
    const dynamicInfo = this.getDynamicStyleInfo(node);

    // 스타일이 없는 경우
    if (!baseClasses && !dynamicInfo) {
      return null;
    }

    // className 표현식 생성 (노드별 변수명 사용)
    const classExpression = this._buildClassNameExpression(
      node,
      baseClasses,
      dynamicInfo
    );

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("className"),
      this.factory.createJsxExpression(undefined, classExpression)
    );
  }

  /**
   * 동적 스타일 정보 조회
   */
  getDynamicStyleInfo(node: FinalAstTree): DynamicStyleInfo | null {
    const dynamicStyles = node.style.dynamic || [];
    if (dynamicStyles.length === 0) {
      return null;
    }

    const propToVariants = new Map<string, string[]>();
    const variantStyles = new Map<string, string>();

    for (const dynamicStyle of dynamicStyles) {
      const extracted = this._extractPropAndValue(dynamicStyle.condition);
      if (!extracted) continue;

      if (!propToVariants.has(extracted.prop)) {
        propToVariants.set(extracted.prop, []);
      }
      propToVariants.get(extracted.prop)!.push(extracted.value);

      const key = `${extracted.prop}:${extracted.value}`;
      const classes = this._cssObjectToTailwind(dynamicStyle.style);
      variantStyles.set(key, classes);
    }

    return { propToVariants, variantStyles };
  }

  /**
   * 모든 노드의 스타일을 미리 변환
   */
  private _preprocessStyles(): void {
    traverseBFS(this.astTree, (node) => {
      // Base 스타일 변환
      if (node.style.base && Object.keys(node.style.base).length > 0) {
        const classes = this._cssObjectToTailwind(node.style.base);
        this.classCache.set(node.id, classes);
      }

      // Dynamic 스타일 변환
      if (node.style.dynamic && node.style.dynamic.length > 0) {
        const propMap = new Map<string, Map<string, string>>();

        for (const dynamic of node.style.dynamic) {
          const extracted = this._extractPropAndValue(dynamic.condition);
          if (!extracted) continue;

          if (!propMap.has(extracted.prop)) {
            propMap.set(extracted.prop, new Map());
          }

          const classes = this._cssObjectToTailwind(dynamic.style);
          // 같은 prop+value 조합에 여러 스타일이 있을 수 있음 - 덮어쓰기 대신 병합
          const existingClasses =
            propMap.get(extracted.prop)!.get(extracted.value) || "";
          const mergedClasses = (existingClasses + " " + classes).trim();
          propMap.get(extracted.prop)!.set(extracted.value, mergedClasses);
        }

        if (propMap.size > 0) {
          this.dynamicClassMaps.set(node.id, propMap);
        }
      }
    });
  }

  /**
   * CSS 객체를 Tailwind 클래스 문자열로 변환
   */
  private _cssObjectToTailwind(style: Record<string, any>): string {
    // font-family, font-weight 등 라이브러리가 잘못 변환하는 속성 분리
    const { problematicStyles, safeStyles } =
      this._separateProblematicStyles(style);

    const classes: string[] = [];

    // 안전한 스타일은 라이브러리로 변환
    if (Object.keys(safeStyles).length > 0) {
      const cssString = this._cssObjectToCssString(safeStyles);
      if (cssString.trim()) {
        let converted = false;
        try {
          const result = CssToTailwindTranslator(`.temp { ${cssString} }`);
          if (result.code === "OK" && result.data.length > 0) {
            let tailwindClasses = result.data[0].resultVal;
            if (tailwindClasses.trim()) {
              // 라이브러리 출력에서 CSS 주석 제거
              tailwindClasses =
                this._removeCssCommentsFromClasses(tailwindClasses);
              classes.push(tailwindClasses);
              converted = true;
            }
          }
        } catch (error) {
          // 라이브러리 실패
        }

        // 라이브러리 변환 실패 또는 빈 결과 시 arbitrary로 fallback
        if (!converted) {
          classes.push(this._cssObjectToArbitraryClasses(safeStyles));
        }
      }
    }

    // 문제가 있는 스타일은 직접 arbitrary로 변환
    if (Object.keys(problematicStyles).length > 0) {
      classes.push(this._cssObjectToArbitraryClasses(problematicStyles));
    }

    return classes.join(" ");
  }

  /**
   * 라이브러리가 잘못 변환하는 CSS 속성 분리
   * - fontFamily/font-family: font-[...]로 잘못 변환됨 (font-size와 혼동)
   * - fontWeight/font-weight: font-[...]로 잘못 변환됨
   * - background: 복합 속성으로 bg-[...]로 변환 시 공백 처리 문제
   * - CSS 변수(var())를 포함한 값: 라이브러리가 부분적으로만 변환하거나 실패
   */
  private _separateProblematicStyles(style: Record<string, any>): {
    problematicStyles: Record<string, any>;
    safeStyles: Record<string, any>;
  } {
    // 무조건 arbitrary로 처리해야 하는 키
    const problematicKeys = [
      "fontFamily",
      "font-family",
      "fontWeight",
      "font-weight",
      "background", // 복합 shorthand 속성 - arbitrary property로 처리
    ];
    const problematicStyles: Record<string, any> = {};
    const safeStyles: Record<string, any> = {};

    for (const [key, value] of Object.entries(style)) {
      const valueStr = String(value);
      // CSS 변수를 포함하거나 문제가 있는 키면 arbitrary로 처리
      if (problematicKeys.includes(key) || valueStr.includes("var(")) {
        problematicStyles[key] = value;
      } else {
        safeStyles[key] = value;
      }
    }

    return { problematicStyles, safeStyles };
  }

  /**
   * CSS 객체를 CSS 문자열로 변환
   */
  private _cssObjectToCssString(style: Record<string, any>): string {
    return Object.entries(style)
      .map(([key, value]) => {
        const cssKey = this._camelToKebab(key);
        return `${cssKey}: ${value};`;
      })
      .join(" ");
  }

  /**
   * CSS 객체를 Tailwind arbitrary 클래스로 변환 (fallback)
   */
  private _cssObjectToArbitraryClasses(style: Record<string, any>): string {
    const classes: string[] = [];

    for (const [key, value] of Object.entries(style)) {
      const cssKey = this._camelToKebab(key);

      // background shorthand는 개별 속성으로 분리 (twind가 arbitrary property를 제대로 처리 못함)
      if (cssKey === "background") {
        const bgClasses = this._parseBackgroundShorthand(String(value));
        classes.push(...bgClasses);
        continue;
      }

      // arbitrary property: [property:value]
      classes.push(`[${cssKey}:${this._escapeArbitraryValue(value)}]`);
    }

    return classes.join(" ");
  }

  /**
   * background shorthand를 개별 Tailwind 클래스로 분리
   * 예: "url(...) lightgray 50% / cover no-repeat"
   * → bg-[url(...)] bg-[lightgray] bg-[position:50%] bg-cover bg-no-repeat
   * 예: "var(--Color-soft-yellow, #FFF4CE)"
   * → bg-[var(--Color-soft-yellow,_#FFF4CE)]
   */
  private _parseBackgroundShorthand(value: string): string[] {
    const classes: string[] = [];

    // url() 추출
    const urlMatch = value.match(/url\([^)]+\)/);
    if (urlMatch) {
      classes.push(`bg-[${urlMatch[0]}]`);
      value = value.replace(urlMatch[0], "").trim();
    }

    // var() 추출 (CSS 변수) - twind에서 bg-[var(...)]는 background-image로 해석되므로
    // background-color로 명시적으로 지정해야 함
    const varMatch = value.match(/var\([^)]+\)/);
    if (varMatch) {
      classes.push(`[background-color:${this._escapeArbitraryValue(varMatch[0])}]`);
      value = value.replace(varMatch[0], "").trim();
    }

    // 쉼표 제거 (multiple backgrounds 구분자)
    value = value.replace(/,\s*/g, " ").trim();

    // "/" 기준으로 position과 size 분리
    const slashIndex = value.indexOf("/");
    let positionPart = value;
    let sizePart = "";

    if (slashIndex !== -1) {
      positionPart = value.substring(0, slashIndex).trim();
      sizePart = value.substring(slashIndex + 1).trim();
    }

    // position 파트에서 색상과 위치 분리
    const positionTokens = positionPart.split(/\s+/).filter(Boolean);
    for (const token of positionTokens) {
      if (this._isColor(token)) {
        classes.push(`bg-[${token}]`);
      } else if (token.includes("%") || token === "center") {
        classes.push(`bg-[position:${token}]`);
      }
    }

    // size 파트 처리
    if (sizePart) {
      const sizeTokens = sizePart.split(/\s+/).filter(Boolean);
      for (const token of sizeTokens) {
        if (token === "cover") {
          classes.push("bg-cover");
        } else if (token === "contain") {
          classes.push("bg-contain");
        } else if (token === "no-repeat") {
          classes.push("bg-no-repeat");
        } else if (token === "repeat") {
          classes.push("bg-repeat");
        } else if (token === "repeat-x") {
          classes.push("bg-repeat-x");
        } else if (token === "repeat-y") {
          classes.push("bg-repeat-y");
        }
      }
    }

    return classes;
  }

  /**
   * 값이 CSS 색상인지 확인
   */
  private _isColor(value: string): boolean {
    // hex, rgb, rgba, hsl, hsla, 색상 이름 등
    return (
      /^#[0-9a-fA-F]{3,8}$/.test(value) ||
      /^rgba?\(/.test(value) ||
      /^hsla?\(/.test(value) ||
      /^(transparent|currentColor|inherit|initial|unset)$/i.test(value) ||
      // CSS 색상 이름 (일부)
      /^(black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|lightgray|darkgray|lightgrey|darkgrey)$/i.test(
        value
      )
    );
  }

  /**
   * Arbitrary value 이스케이프
   * Tailwind에서 _는 공백으로 변환되므로, 원래 언더스코어는 \_로 이스케이프
   */
  private _escapeArbitraryValue(value: any): string {
    return (
      String(value)
        .replace(/\/\*[\s\S]*?\*\//g, "") // CSS 주석 제거
        .trim()
        .replace(/_/g, "\\_") // 기존 언더스코어 이스케이프 (Tailwind에서 _는 공백으로 변환됨)
        .replace(/\s+/g, "_") // 공백을 언더스코어로
        .replace(/['"]/g, "")
    ); // 따옴표 제거
  }

  /**
   * 라이브러리 출력에서 CSS 주석 제거
   * 예: leading-[136% ...comment... ] -> leading-[136%]
   */
  private _removeCssCommentsFromClasses(classes: string): string {
    // CSS 주석 패턴을 전체 문자열에서 제거
    // 주석 제거 후 남는 공백도 정리
    return classes
      .replace(/\/\*[\s\S]*?\*\//g, "") // CSS 주석 제거
      .replace(/\s+\]/g, "]") // ] 앞 공백 제거
      .replace(/\[\s+/g, "[") // [ 뒤 공백 제거
      .replace(/\s+/g, " ") // 연속 공백 정리
      .trim();
  }

  /**
   * className 표현식 빌드 (노드별 변수명 사용)
   */
  private _buildClassNameExpression(
    node: FinalAstTree,
    baseClasses: string,
    dynamicInfo: DynamicStyleInfo | null
  ): ts.Expression {
    const args: ts.Expression[] = [];

    // Base 클래스
    if (baseClasses) {
      args.push(this.factory.createStringLiteral(baseClasses));
    }

    // 동적 클래스 (노드별 변수명 사용)
    if (dynamicInfo) {
      const nodeVarNames = this.nodeClassVarNames.get(node.id);

      for (const [
        propName,
        _variants,
      ] of dynamicInfo.propToVariants.entries()) {
        // 노드별 변수명 조회 (예: ButtonSizeClasses, LabelSizeClasses)
        const varName =
          nodeVarNames?.get(propName) ||
          `${this._sanitizeName(propName)}Classes`;

        // Boolean prop 처리: propName ? "True" : "False" 로 접근
        // (JavaScript에서 boolean을 object key로 사용하면 "true"/"false" 문자열로 변환되어
        //  Figma의 "True"/"False" 키와 일치하지 않기 때문)
        const propDef = this.astTree.props[propName];
        const isBooleanProp = propDef?.type === "BOOLEAN";

        let indexExpression: ts.Expression;
        if (isBooleanProp) {
          // propName ? "True" : "False"
          indexExpression = this.factory.createConditionalExpression(
            this.factory.createIdentifier(propName),
            this.factory.createToken(ts.SyntaxKind.QuestionToken),
            this.factory.createStringLiteral("True"),
            this.factory.createToken(ts.SyntaxKind.ColonToken),
            this.factory.createStringLiteral("False")
          );
        } else {
          indexExpression = this.factory.createIdentifier(propName);
        }

        const elementAccess = this.factory.createElementAccessExpression(
          this.factory.createIdentifier(varName),
          indexExpression
        );

        args.push(elementAccess);
      }
    }

    // cn() 호출 또는 단일 문자열
    if (args.length === 0) {
      return this.factory.createStringLiteral("");
    }

    if (args.length === 1 && ts.isStringLiteral(args[0])) {
      return args[0];
    }

    return this.factory.createCallExpression(
      this.factory.createIdentifier("cn"),
      undefined,
      args
    );
  }

  /**
   * camelCase를 kebab-case로 변환
   */
  private _camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }

  /**
   * 인라인 cn 함수 생성
   * const cn = (...classes: (string | undefined | null | false)[]) =>
   *   classes.filter(Boolean).join(" ");
   */
  private _createInlineCnFunction(): ts.VariableStatement {
    // 파라미터: ...classes: (string | undefined | null | false)[]
    const parameter = this.factory.createParameterDeclaration(
      undefined,
      this.factory.createToken(ts.SyntaxKind.DotDotDotToken),
      this.factory.createIdentifier("classes"),
      undefined,
      this.factory.createArrayTypeNode(
        this.factory.createUnionTypeNode([
          this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          this.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
          this.factory.createLiteralTypeNode(this.factory.createNull()),
          this.factory.createLiteralTypeNode(this.factory.createFalse()),
        ])
      ),
      undefined
    );

    // 함수 본문: classes.filter(Boolean).join(" ")
    const body = this.factory.createCallExpression(
      this.factory.createPropertyAccessExpression(
        this.factory.createCallExpression(
          this.factory.createPropertyAccessExpression(
            this.factory.createIdentifier("classes"),
            this.factory.createIdentifier("filter")
          ),
          undefined,
          [this.factory.createIdentifier("Boolean")]
        ),
        this.factory.createIdentifier("join")
      ),
      undefined,
      [this.factory.createStringLiteral(" ")]
    );

    // 화살표 함수: (...classes) => classes.filter(Boolean).join(" ")
    const arrowFunction = this.factory.createArrowFunction(
      undefined,
      undefined,
      [parameter],
      undefined,
      this.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      body
    );

    // const cn = ...
    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createIdentifier("cn"),
            undefined,
            undefined,
            arrowFunction
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * 이름 정규화 (변수명으로 사용 가능하게)
   */
  private _sanitizeName(name: string): string {
    return name
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9_$]/g, "")
      .replace(/^[0-9]/, "_$&");
  }

  /**
   * 조건에서 prop과 값 추출
   */
  private _extractPropAndValue(condition: any): {
    prop: string;
    value: string;
  } | null {
    if (!condition || condition.type !== "BinaryExpression") {
      return null;
    }

    if (
      condition.operator === "===" &&
      condition.left?.type === "MemberExpression" &&
      condition.left.object?.name === "props" &&
      condition.right?.type === "Literal"
    ) {
      const propName = condition.left.property?.name;
      const propValue = condition.right.value;

      if (propName && propValue !== undefined) {
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
}

export default TailwindStrategy;
