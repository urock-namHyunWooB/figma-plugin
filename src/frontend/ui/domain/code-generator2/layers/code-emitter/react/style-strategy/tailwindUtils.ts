/**
 * tailwindUtils.ts
 *
 * CSS → Tailwind 변환 유틸리티
 * TailwindStrategy / ShadcnStrategy 등 여러 전략에서 공유
 */

import type { PseudoClass } from "../../../../types/types";

/**
 * CSS 속성+값 → Tailwind 클래스 매핑
 */
export const CSS_TO_TAILWIND: Record<string, Record<string, string>> = {
  display: {
    flex: "flex",
    "inline-flex": "inline-flex",
    grid: "grid",
    block: "block",
    "inline-block": "inline-block",
    none: "hidden",
  },
  position: {
    absolute: "absolute",
    relative: "relative",
    fixed: "fixed",
    sticky: "sticky",
  },
  flexDirection: {
    row: "flex-row",
    column: "flex-col",
    "row-reverse": "flex-row-reverse",
    "column-reverse": "flex-col-reverse",
  },
  justifyContent: {
    "flex-start": "justify-start",
    "flex-end": "justify-end",
    center: "justify-center",
    "space-between": "justify-between",
    "space-around": "justify-around",
    "space-evenly": "justify-evenly",
  },
  alignItems: {
    "flex-start": "items-start",
    "flex-end": "items-end",
    center: "items-center",
    stretch: "items-stretch",
    baseline: "items-baseline",
  },
  textAlign: {
    left: "text-left",
    center: "text-center",
    right: "text-right",
    justify: "text-justify",
  },
  fontStyle: {
    normal: "not-italic",
    italic: "italic",
  },
  overflow: {
    hidden: "overflow-hidden",
    auto: "overflow-auto",
    scroll: "overflow-scroll",
    visible: "overflow-visible",
  },
  boxSizing: {
    "border-box": "box-border",
    "content-box": "box-content",
  },
  flexWrap: {
    wrap: "flex-wrap",
    nowrap: "flex-nowrap",
    "wrap-reverse": "flex-wrap-reverse",
  },
  flexShrink: {
    "0": "shrink-0",
    "1": "shrink",
  },
  flexGrow: {
    "0": "grow-0",
    "1": "grow",
  },
};

/**
 * CSS 속성 → Tailwind 접두사
 */
export const CSS_TO_PREFIX: Record<string, string> = {
  width: "w",
  minWidth: "min-w",
  maxWidth: "max-w",
  height: "h",
  minHeight: "min-h",
  maxHeight: "max-h",
  padding: "p",
  paddingTop: "pt",
  paddingRight: "pr",
  paddingBottom: "pb",
  paddingLeft: "pl",
  margin: "m",
  marginTop: "mt",
  marginRight: "mr",
  marginBottom: "mb",
  marginLeft: "ml",
  gap: "gap",
  borderRadius: "rounded",
  fontSize: "text",
  lineHeight: "leading",
  opacity: "opacity",
  zIndex: "z",
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
  letterSpacing: "tracking",
};

/**
 * Pseudo-class → Tailwind prefix
 */
export const PSEUDO_TO_PREFIX: Partial<Record<PseudoClass, string>> = {
  ":hover": "hover:",
  ":active": "active:",
  ":focus": "focus:",
  ":disabled": "disabled:",
  ":focus-visible": "focus-visible:",
  ":checked": "checked:",
  ":visited": "visited:",
  "::placeholder": "placeholder:",
};

// ─── Internal helpers (non-exported) ────────────────────────────────

/** kebab-case → camelCase */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

/** camelCase → kebab-case */
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * CSS 셀렉터를 Tailwind arbitrary variant로 변환
 * e.g., "svg path" → "[&_svg_path]", "& > div svg path" → "[&>div_svg_path]"
 */
function selectorToArbitraryVariant(selector: string): string {
  let s = selector.trim();
  // &로 시작하지 않으면 자손 셀렉터로 & 추가
  if (!s.startsWith("&")) {
    s = "& " + s;
  }
  // 공백 → _ (Tailwind arbitrary variant 문법)
  s = s.replace(/\s+/g, "_");
  return `[${s}]`;
}

// ─── Exported functions ─────────────────────────────────────────────

/**
 * Arbitrary value 이스케이프
 */
export function escapeArbitraryValue(value: string): string {
  return value
    .trim()
    .replace(/\/\*.*?\*\//g, "") // CSS 주석 제거
    .trim()
    .replace(/_/g, "\\_") // underscore 이스케이프
    .replace(/\s+/g, "_") // 공백 → underscore
    .replace(/['"]/g, ""); // 따옴표 제거
}

/**
 * 단일 CSS 속성을 Tailwind 클래스로 변환
 */
export function cssPropertyToTailwind(property: string, value: string): string {
  const valueStr = value.trim();

  // kebab → camelCase
  const camelProperty = kebabToCamel(property);

  // 정확한 매핑 확인
  const exactMap = CSS_TO_TAILWIND[camelProperty];
  if (exactMap && exactMap[valueStr]) {
    return exactMap[valueStr];
  }

  // 100% → full
  if (valueStr === "100%") {
    if (camelProperty === "width") return "w-full";
    if (camelProperty === "height") return "h-full";
  }

  // backdrop-filter: blur(Npx) → backdrop-blur-[Npx]
  if (camelProperty === "backdropFilter") {
    const blurMatch = valueStr.match(/^blur\((.+)\)$/);
    if (blurMatch) return `backdrop-blur-[${escapeArbitraryValue(blurMatch[1])}]`;
    return `backdrop-blur-[${escapeArbitraryValue(valueStr)}]`;
  }

  // 접두사 기반 변환
  const prefix = CSS_TO_PREFIX[camelProperty];
  if (prefix) {
    // text-[var(...)]은 Tailwind이 color로 해석하므로 length: 타입 힌트 필요
    if (camelProperty === "fontSize") {
      return `${prefix}-[length:${escapeArbitraryValue(valueStr)}]`;
    }
    return `${prefix}-[${escapeArbitraryValue(valueStr)}]`;
  }

  // 색상: arbitrary property 사용
  // bg-[var(...)]는 Tailwind가 background-image로 해석할 수 있으므로 [background-color:...] 사용
  if (camelProperty === "backgroundColor" || camelProperty === "background") {
    return `[background-color:${escapeArbitraryValue(valueStr)}]`;
  }
  if (camelProperty === "color") {
    return `text-[${escapeArbitraryValue(valueStr)}]`;
  }
  if (camelProperty === "fill") {
    return `fill-[${escapeArbitraryValue(valueStr)}]`;
  }

  // border: arbitrary property (shorthand는 border- prefix가 지원 안 함)
  if (camelProperty === "border") {
    return `[border:${escapeArbitraryValue(valueStr)}]`;
  }
  if (camelProperty === "borderColor") {
    return `border-[${escapeArbitraryValue(valueStr)}]`;
  }

  // font-family / font-weight: 같은 font- prefix 충돌 방지
  if (camelProperty === "fontFamily") {
    return `[font-family:${escapeArbitraryValue(valueStr)}]`;
  }
  if (camelProperty === "fontWeight") {
    return `[font-weight:${escapeArbitraryValue(valueStr)}]`;
  }

  // box-shadow → shadow-[...]
  if (camelProperty === "boxShadow") {
    return `shadow-[${escapeArbitraryValue(valueStr)}]`;
  }

  // 기타: arbitrary property fallback
  const cssKey = camelToKebab(camelProperty);
  return `[${cssKey}:${escapeArbitraryValue(valueStr)}]`;
}

/**
 * CSS 객체를 Tailwind 클래스 배열로 변환
 */
export function cssObjectToTailwind(style: Record<string, string | number>): string[] {
  const classes: string[] = [];

  for (const [key, value] of Object.entries(style)) {
    // __nested: 중첩 셀렉터 → arbitrary variant 클래스 변환
    if (key === "__nested" && typeof value === "object" && value !== null) {
      const nested = value as Record<string, Record<string, string | number>>;
      for (const [selector, nestedStyle] of Object.entries(nested)) {
        const variant = selectorToArbitraryVariant(selector);
        for (const [prop, val] of Object.entries(nestedStyle)) {
          const twClass = cssPropertyToTailwind(prop, String(val));
          if (twClass) {
            classes.push(`${variant}:${twClass}`);
          }
        }
      }
      continue;
    }

    const tailwindClass = cssPropertyToTailwind(key, String(value));
    if (tailwindClass) {
      classes.push(tailwindClass);
    }
  }

  return classes;
}

/**
 * 클래스 문자열을 JS 리터럴로 감싸기
 * \_가 포함된 경우 String.raw를 사용해 백슬래시 보존
 */
export function wrapClassString(str: string): string {
  if (str.includes("\\")) {
    return "String.raw`" + str + "`";
  }
  return `"${str}"`;
}

/**
 * JavaScript 객체 키로 사용 시 따옴표가 필요한지 확인
 * (하이픈, 공백 등 특수문자 포함 시 필요)
 */
export function needsQuoting(key: string): boolean {
  return !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}

/**
 * base와 다른 스타일만 추출
 */
export function getDiffStyles(
  base: Record<string, string | number>,
  target: Record<string, string | number>
): Record<string, string | number> {
  const diff: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(target)) {
    if (base[key] !== value) {
      diff[key] = value;
    }
  }
  return diff;
}
