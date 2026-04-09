/**
 * Variant style feedback fix-assist.
 *
 * UI에서 온 "apply-fix" 메시지를 받아 해당 Figma 노드의 CSS 속성을 기대값으로 변경.
 * Undo는 Figma 기본 메커니즘에 위임 (한 메시지 핸들러 = 하나의 undo 스텝).
 */

export interface FixSpec {
  cssProperty: string;
  expectedValue: string;
}

export interface FixResult {
  success: boolean;
  reason?: string;
}

/** "#3B82F6" → { r, g, b } ∈ [0, 1] */
function parseHex(value: string): { r: number; g: number; b: number } | null {
  const trimmed = value.trim();
  const long = trimmed.match(/^#([0-9a-fA-F]{6})$/);
  if (long) {
    const hex = long[1];
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
    };
  }
  const short = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (short) {
    const [r, g, b] = short[1].split("").map((c) => parseInt(c + c, 16));
    return { r: r / 255, g: g / 255, b: b / 255 };
  }
  return null;
}

/** "12px" → 12. px만 지원. */
function parsePx(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? parseFloat(match[1]) : null;
}

/** "0.5" → 0.5. */
function parseNumber(value: string): number | null {
  const n = parseFloat(value.trim());
  return isNaN(n) ? null : n;
}

/**
 * 단일 fix를 Figma 노드에 적용.
 * 지원 속성: background, background-color, color, border-color, border-radius,
 *          padding-*, gap, opacity.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFix(node: any, spec: FixSpec): FixResult {
  const prop = spec.cssProperty.toLowerCase();
  const val = spec.expectedValue;

  switch (prop) {
    case "background":
    case "background-color": {
      const rgb = parseHex(val);
      if (!rgb) return { success: false, reason: `invalid color: ${val}` };
      node.fills = [{ type: "SOLID", color: rgb, opacity: 1 }];
      return { success: true };
    }

    case "color": {
      const rgb = parseHex(val);
      if (!rgb) return { success: false, reason: `invalid color: ${val}` };
      if (node.type !== "TEXT") {
        return { success: false, reason: "color는 TEXT 노드에만 적용 가능" };
      }
      node.fills = [{ type: "SOLID", color: rgb, opacity: 1 }];
      return { success: true };
    }

    case "border-color": {
      const rgb = parseHex(val);
      if (!rgb) return { success: false, reason: `invalid color: ${val}` };
      node.strokes = [{ type: "SOLID", color: rgb, opacity: 1 }];
      return { success: true };
    }

    case "border-radius": {
      const px = parsePx(val);
      if (px === null) return { success: false, reason: `invalid px: ${val}` };
      node.cornerRadius = px;
      return { success: true };
    }

    case "padding-top":
    case "padding-right":
    case "padding-bottom":
    case "padding-left": {
      const px = parsePx(val);
      if (px === null) return { success: false, reason: `invalid px: ${val}` };
      const key = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      node[key] = px;
      return { success: true };
    }

    case "gap": {
      const px = parsePx(val);
      if (px === null) return { success: false, reason: `invalid px: ${val}` };
      node.itemSpacing = px;
      return { success: true };
    }

    case "opacity": {
      const n = parseNumber(val);
      if (n === null) return { success: false, reason: `invalid number: ${val}` };
      node.opacity = n;
      return { success: true };
    }

    case "width": {
      const px = parsePx(val);
      if (px === null) return { success: false, reason: `invalid px: ${val}` };
      if (typeof node.resize !== "function") {
        return { success: false, reason: "node does not support resize" };
      }
      node.resize(px, node.height);
      return { success: true };
    }

    case "height": {
      const px = parsePx(val);
      if (px === null) return { success: false, reason: `invalid px: ${val}` };
      if (typeof node.resize !== "function") {
        return { success: false, reason: "node does not support resize" };
      }
      node.resize(node.width, px);
      return { success: true };
    }

    default:
      return { success: false, reason: `unsupported CSS property: ${prop}` };
  }
}

/**
 * 여러 fix를 한 번에 적용 (per-group).
 * 모두 같은 node에 대해 적용됨을 가정.
 */
export function applyFixes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: any,
  specs: FixSpec[]
): { appliedCount: number; skippedReasons: string[] } {
  let appliedCount = 0;
  const skippedReasons: string[] = [];

  for (const spec of specs) {
    const result = applyFix(node, spec);
    if (result.success) {
      appliedCount++;
    } else {
      skippedReasons.push(`${spec.cssProperty}: ${result.reason ?? "unknown"}`);
    }
  }

  return { appliedCount, skippedReasons };
}
