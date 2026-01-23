import { describe, test, expect } from "vitest";
import SvgToJsx from "@compiler/core/react-generator/generate-component/jsx-tree/SvgToJsx";
import ts from "typescript";

describe("SvgToJsx", () => {
  const svgToJsx = new SvgToJsx();

  /**
   * JSX AST를 문자열로 변환하는 헬퍼 함수
   */
  function printJsx(node: ts.JsxElement | ts.JsxSelfClosingElement | null): string {
    if (!node) return "";
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const sourceFile = ts.createSourceFile(
      "test.tsx",
      "",
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX
    );
    return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
  }

  describe("기본 변환", () => {
    test("self-closing SVG 요소를 변환한다", () => {
      const svg = '<svg width="24" height="24"/>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain("svg");
      expect(code).toContain("width={24}");
      expect(code).toContain("height={24}");
    });

    test("자식 요소가 있는 SVG를 변환한다", () => {
      const svg = '<svg width="24" height="24"><path d="M0 0L10 10"/></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain("<svg");
      expect(code).toContain("<path");
      expect(code).toContain('d="M0 0L10 10"');
      expect(code).toContain("</svg>");
    });

    test("중첩된 요소를 변환한다", () => {
      const svg = '<svg><g><path d="M0 0"/><circle cx="10" cy="10" r="5"/></g></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain("<g>");
      expect(code).toContain("<path");
      expect(code).toContain("<circle");
      expect(code).toContain("</g>");
    });
  });

  describe("속성 변환", () => {
    test("kebab-case 속성을 camelCase로 변환한다", () => {
      const svg = '<svg><line stroke-width="2" stroke-linecap="round"/></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain("strokeWidth={2}");
      expect(code).toContain('strokeLinecap="round"');
      expect(code).not.toContain("stroke-width");
      expect(code).not.toContain("stroke-linecap");
    });

    test("fill-opacity를 fillOpacity로 변환한다", () => {
      const svg = '<svg><rect fill-opacity="0.5"/></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain("fillOpacity");
      expect(code).not.toContain("fill-opacity");
    });

    test("class를 className으로 변환한다", () => {
      const svg = '<svg class="icon"/>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain('className="icon"');
      expect(code).not.toContain("class=");
    });

    test("xmlns 속성을 제거한다", () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24"/>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).not.toContain("xmlns");
      expect(code).toContain("width={24}");
    });
  });

  describe("숫자 속성 처리", () => {
    test("정수 속성값을 JSX Expression으로 변환한다", () => {
      const svg = '<svg width="100" height="50"/>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain("width={100}");
      expect(code).toContain("height={50}");
    });

    test("소수점 속성값을 JSX Expression으로 변환한다", () => {
      const svg = '<svg><circle cx="10.5" cy="20.3" r="5.25"/></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain("cx={10.5}");
      expect(code).toContain("cy={20.3}");
      expect(code).toContain("r={5.25}");
    });

    test("퍼센트 값은 문자열로 유지한다", () => {
      const svg = '<svg width="100%"/>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain('width="100%"');
    });

    test("단위가 있는 값은 문자열로 유지한다", () => {
      const svg = '<svg width="10em"/>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain('width="10em"');
    });
  });

  describe("복잡한 SVG 처리", () => {
    test("viewBox 속성을 올바르게 처리한다", () => {
      const svg = '<svg viewBox="0 0 24 24" width="24" height="24"/>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain('viewBox="0 0 24 24"');
      expect(code).toContain("width={24}");
    });

    test("path d 속성을 문자열로 유지한다", () => {
      const svg = '<svg><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain('d="M12 2L2 7l10 5 10-5-10-5z"');
    });

    test("line 요소를 변환한다", () => {
      const svg = '<svg><line x1="0" y1="0" x2="100" y2="100" stroke="black"/></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain("<line");
      expect(code).toContain("x1={0}");
      expect(code).toContain("x2={100}");
      expect(code).toContain('stroke="black"');
    });

    test("다중 자식 요소를 처리한다", () => {
      const svg = `<svg>
        <rect x="0" y="0" width="10" height="10"/>
        <rect x="20" y="20" width="10" height="10"/>
      </svg>`;
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      // 두 개의 rect 요소가 있어야 함
      const rectMatches = code.match(/<rect/g);
      expect(rectMatches).toHaveLength(2);
    });
  });

  describe("에러 처리", () => {
    test("빈 문자열은 null을 반환한다", () => {
      const result = svgToJsx.convert("");
      expect(result).toBeNull();
    });

    test("잘못된 SVG 형식은 null을 반환한다", () => {
      const result = svgToJsx.convert("not a valid svg");
      expect(result).toBeNull();
    });
  });

  describe("fill 색상 처리", () => {
    test("단일 색상 SVG는 원래 색상을 유지한다", () => {
      const svg = '<svg><path d="M0 0" fill="#0050FF"/></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      // 원래 색상 유지 (currentColor는 부모에 color CSS가 없으면 렌더링 문제 발생)
      expect(code).toContain('fill="#0050FF"');
    });

    test("다중 색상 SVG에서 각 path의 fill 색상을 유지한다", () => {
      const svg = `<svg viewBox="0 0 100 100">
        <path d="M0 0" fill="#0050FF"/>
        <path d="M10 10" fill="white"/>
        <path d="M20 20" fill="black"/>
      </svg>`;
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      // 다중 색상 SVG는 원래 색상 유지 (각 path별 고유 색상)
      expect(code).toContain('fill="#0050FF"');
      expect(code).toContain('fill="white"');
      expect(code).toContain('fill="black"');
    });

    test("단일 rgb 색상 SVG는 원래 색상을 유지한다", () => {
      const svg = '<svg><rect fill="rgb(0, 80, 255)"/></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      // 원래 색상 유지 (currentColor는 부모에 color CSS가 없으면 렌더링 문제 발생)
      expect(code).toContain('fill="rgb(0, 80, 255)"');
    });

    test("fill=none은 그대로 유지한다", () => {
      const svg = '<svg fill="none"><path d="M0 0"/></svg>';
      const result = svgToJsx.convert(svg);
      const code = printJsx(result);

      expect(code).toContain('fill="none"');
    });
  });
});

