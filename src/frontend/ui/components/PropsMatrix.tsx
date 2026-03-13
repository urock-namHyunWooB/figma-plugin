import React, { useMemo, useCallback } from "react";
import { css } from "@emotion/react";
import type { PropDefinition } from "@code-generator2/types/public";
import type { VariantInconsistency } from "@code-generator2";
import ErrorBoundary from "./ErrorBoundary";

interface PropsMatrixProps {
  Component: React.ComponentType<any> | null;
  propDefinitions: PropDefinition[];
  /** slot/string/function props의 고정값 */
  fixedProps: Record<string, any>;
  isLoading: boolean;
  error: string | null;
  /** variant 불일치 진단 정보 */
  warnings?: VariantInconsistency[];
}

interface Axis {
  name: string;
  values: (string | boolean)[];
}

/**
 * VARIANT/BOOLEAN props를 2D 테이블 축과 나머지 조합으로 분리
 *
 * - VARIANT 2개 이상 → 상위 2개를 row/col 축
 * - VARIANT 1개 → col 축만 사용
 * - VARIANT 0개 → BOOLEAN 중 첫 번째를 col 축
 * - 나머지 props → 셀 내 서브조합
 */
function buildTableData(
  propDefs: PropDefinition[],
  fixedProps: Record<string, any>
) {
  const variantProps = propDefs
    .filter((p) => p.type === "VARIANT" && p.variantOptions?.length)
    .sort((a, b) => (b.variantOptions?.length ?? 0) - (a.variantOptions?.length ?? 0));

  const booleanProps = propDefs.filter((p) => p.type === "BOOLEAN");

  const allAxes: Axis[] = [
    ...variantProps.map((vp) => ({
      name: vp.name,
      values: vp.variantOptions! as (string | boolean)[],
    })),
    ...booleanProps.map((bp) => {
      const vals: (string | boolean)[] = [true, false];
      if (bp.extraValues) vals.push(...bp.extraValues);
      return { name: bp.name, values: vals };
    }),
  ];

  // 축이 없으면 단일 셀
  if (allAxes.length === 0) {
    return {
      rowAxis: null,
      colAxis: null,
      extraAxes: [] as Axis[],
      fixedProps,
    };
  }

  // 축이 1개면 col만
  if (allAxes.length === 1) {
    return {
      rowAxis: null,
      colAxis: allAxes[0],
      extraAxes: [] as Axis[],
      fixedProps,
    };
  }

  // 2개 이상 → 상위 2개를 row/col, 나머지는 extra
  return {
    rowAxis: allAxes[0],
    colAxis: allAxes[1],
    extraAxes: allAxes.slice(2),
    fixedProps,
  };
}

/**
 * 추가 축들의 직곱 생성
 */
function generateExtraCombinations(
  extraAxes: Axis[]
): Record<string, any>[] {
  if (extraAxes.length === 0) return [{}];

  let combos: Record<string, any>[] = [{}];
  for (const axis of extraAxes) {
    const next: Record<string, any>[] = [];
    for (const combo of combos) {
      for (const val of axis.values) {
        next.push({ ...combo, [axis.name]: val });
      }
    }
    combos = next;
  }
  return combos;
}

// --- Styles ---

const containerStyle = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const tableWrapperStyle = css`
  overflow: auto;
  max-height: calc(100vh - 120px);

  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }
`;

const tableStyle = css`
  border-collapse: separate;
  border-spacing: 0;
  width: max-content;
  min-width: 100%;
`;

const thStyle = css`
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f3f4f6;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  text-align: center;
  border-bottom: 2px solid #d1d5db;
  white-space: nowrap;
`;

const cornerStyle = css`
  ${thStyle}
  position: sticky;
  left: 0;
  z-index: 3;
  background: #e5e7eb;
`;

const rowHeaderStyle = css`
  position: sticky;
  left: 0;
  z-index: 1;
  background: #f9fafb;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  border-right: 2px solid #d1d5db;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: middle;
  white-space: nowrap;
`;

const cellTdStyle = css`
  padding: 4px;
  border-bottom: 1px solid #e5e7eb;
  border-right: 1px solid #f3f4f6;
  vertical-align: middle;
`;

const cellInnerStyle = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-width: 80px;
  min-height: 60px;
  padding: 4px;
`;

const subLabelStyle = css`
  font-size: 9px;
  color: #9ca3af;
  font-family: monospace;
  white-space: nowrap;
`;

const emptyStyle = css`
  color: #6b7280;
  font-size: 13px;
  text-align: center;
  padding: 24px;
`;

const countStyle = css`
  font-size: 11px;
  color: #9ca3af;
  padding: 0 4px;
`;

// 1D 그리드 (축이 1개일 때)
const singleAxisGridStyle = css`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  padding: 4px;
`;

const singleCellStyle = css`
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  background: white;
`;

const singleCellLabelStyle = css`
  padding: 4px 8px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 10px;
  color: #6b7280;
  font-family: monospace;
  text-align: center;
`;

const singleCellPreviewStyle = css`
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
`;

const warningCellStyle = css`
  outline: 2px solid #ef4444;
  outline-offset: -2px;
  position: relative;
`;

const warningBadgeStyle = css`
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
`;

const warningTooltipStyle = css`
  position: absolute;
  bottom: calc(100% + 4px);
  right: 0;
  background: #1f2937;
  color: #fff;
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 4px;
  white-space: pre;
  z-index: 10;
  pointer-events: none;

  &::after {
    content: "";
    position: absolute;
    top: 100%;
    right: 8px;
    border: 4px solid transparent;
    border-top-color: #1f2937;
  }
`;

/**
 * 셀의 prop 조합이 진단의 outlier variant와 매치되는지 확인
 */
function findCellWarnings(
  cellProps: Record<string, any>,
  warnings: VariantInconsistency[]
): VariantInconsistency[] {
  if (!warnings.length) return [];

  return warnings.filter((w) =>
    w.variants.some((v) =>
      Object.entries(v.props).every(
        ([key, val]) => String(cellProps[key]) === val
      )
    )
  );
}

/**
 * 경고가 있는 셀에 하이라이트 + 툴팁을 표시하는 래퍼
 */
function WarningOverlay({
  cellWarnings,
  onSelectNode,
}: {
  cellWarnings: VariantInconsistency[];
  onSelectNode?: (nodeId: string) => void;
}) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  if (cellWarnings.length === 0) return null;

  const tooltipLines = cellWarnings.map((w) => {
    const variantDetails = w.variants.map((v) => {
      // 현재 셀의 축(propName) 외 다른 prop만 표시
      const otherProps = Object.entries(v.props)
        .filter(([k]) => k !== w.propName)
        .map(([k, val]) => `${k}=${val}`)
        .join(", ");
      return `  ${otherProps || "default"}: ${v.value}`;
    });
    const expected = w.expectedValue ? `\n  (기대값: ${w.expectedValue})` : "";
    return `${w.cssProperty} 값 불일치:\n${variantDetails.join("\n")}${expected}`;
  });

  return (
    <>
      <span
        css={warningBadgeStyle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={tooltipLines.join("\n")}
      >
        ⚠️
      </span>
      {showTooltip && (
        <div css={warningTooltipStyle}>
          {tooltipLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </>
  );
}

const MAX_TOTAL = 200;

export function PropsMatrix({
  Component,
  propDefinitions,
  fixedProps,
  isLoading,
  error,
  warnings = [],
}: PropsMatrixProps) {
  const tableData = useMemo(
    () => buildTableData(propDefinitions, fixedProps),
    [propDefinitions, fixedProps]
  );

  const extraCombos = useMemo(
    () => generateExtraCombinations(tableData.extraAxes),
    [tableData.extraAxes]
  );

  if (isLoading) {
    return <div css={emptyStyle}>Loading...</div>;
  }

  if (error) {
    return (
      <div css={emptyStyle} style={{ color: "#dc2626" }}>
        Error: {error}
      </div>
    );
  }

  if (!Component) {
    return <div css={emptyStyle}>Select a component in Figma to preview</div>;
  }

  const { rowAxis, colAxis } = tableData;

  // 축이 아예 없으면 단일 프리뷰
  if (!colAxis) {
    return (
      <div css={containerStyle}>
        <span css={countStyle}>1 variant</span>
        <div css={singleAxisGridStyle}>
          <div css={singleCellStyle}>
            <div css={singleCellLabelStyle}>Default</div>
            <div css={singleCellPreviewStyle}>
              <ErrorBoundary
                fallback={<span style={{ color: "#dc2626", fontSize: 11 }}>Render error</span>}
              >
                <Component {...fixedProps} />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 1축만 있을 때 → 가로 그리드
  if (!rowAxis) {
    const total = colAxis.values.length * extraCombos.length;
    return (
      <div css={containerStyle}>
        <span css={countStyle}>
          {total} variants ({colAxis.name})
        </span>
        <div css={singleAxisGridStyle}>
          {colAxis.values.map((colVal) =>
            extraCombos.map((extra, ei) => {
              const props = { ...fixedProps, [colAxis.name]: colVal, ...extra };
              const extraLabel = Object.entries(extra)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(", ");
              return (
                <div key={`${String(colVal)}-${ei}`} css={singleCellStyle}>
                  <div css={singleCellLabelStyle}>
                    {String(colVal)}
                    {extraLabel && <br />}
                    {extraLabel && <span style={{ fontSize: 9, color: "#9ca3af" }}>{extraLabel}</span>}
                  </div>
                  <div css={singleCellPreviewStyle}>
                    <ErrorBoundary
                      fallback={<span style={{ color: "#dc2626", fontSize: 11 }}>Render error</span>}
                    >
                      <Component {...props} />
                    </ErrorBoundary>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // 2축 → 2D 테이블
  const total = rowAxis.values.length * colAxis.values.length * extraCombos.length;
  const isTruncated = total > MAX_TOTAL;

  return (
    <div css={containerStyle}>
      <span css={countStyle}>
        {total} variants ({rowAxis.name} x {colAxis.name}
        {extraCombos.length > 1 && ` x ${extraCombos.length} others`})
        {isTruncated && ` — showing first ${MAX_TOTAL}`}
      </span>

      <div css={tableWrapperStyle}>
        <table css={tableStyle}>
          <thead>
            <tr>
              <th css={cornerStyle}>
                {rowAxis.name} \ {colAxis.name}
              </th>
              {colAxis.values.map((colVal) => (
                <th key={String(colVal)} css={thStyle}>
                  {String(colVal)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowAxis.values.map((rowVal) => (
              <tr key={String(rowVal)}>
                <td css={rowHeaderStyle}>{String(rowVal)}</td>
                {colAxis.values.map((colVal) => {
                  const cellProps = {
                    ...fixedProps,
                    [rowAxis.name]: rowVal,
                    [colAxis.name]: colVal,
                  };
                  const cellWarnings = findCellWarnings(cellProps, warnings);
                  return (
                    <td
                      key={String(colVal)}
                      css={[cellTdStyle, cellWarnings.length > 0 && warningCellStyle]}
                      style={{ position: "relative" }}
                    >
                      {cellWarnings.length > 0 && (
                        <WarningOverlay cellWarnings={cellWarnings} />
                      )}
                      <div css={cellInnerStyle}>
                        {extraCombos.map((extra, ei) => {
                          const props = { ...cellProps, ...extra };
                          const extraLabel = Object.entries(extra)
                            .map(([k, v]) => `${k}=${String(v)}`)
                            .join(", ");
                          return (
                            <React.Fragment key={ei}>
                              {extraLabel && (
                                <span css={subLabelStyle}>{extraLabel}</span>
                              )}
                              <ErrorBoundary
                                fallback={
                                  <span style={{ color: "#dc2626", fontSize: 11 }}>
                                    Render error
                                  </span>
                                }
                              >
                                <Component {...props} />
                              </ErrorBoundary>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
