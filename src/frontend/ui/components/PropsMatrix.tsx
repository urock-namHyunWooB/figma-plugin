import React, { useMemo } from "react";
import { css } from "@emotion/react";
import type { PropDefinition } from "@code-generator2/types/public";
import ErrorBoundary from "./ErrorBoundary";

interface PropsMatrixProps {
  Component: React.ComponentType<any> | null;
  propDefinitions: PropDefinition[];
  /** slot/string/function props의 고정값 */
  fixedProps: Record<string, any>;
  isLoading: boolean;
  error: string | null;
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
  const slotProps = propDefs.filter((p) => p.type === "SLOT");

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
    // SLOT prop은 별도 토글로 제어하므로 variant 축에서 제외
  ];

  // 축에 포함된 SLOT prop의 mockup 값 보존 (true→mockup, false→undefined)
  const slotMockups: Record<string, any> = {};
  for (const sp of slotProps) {
    if (fixedProps[sp.name] !== undefined) {
      slotMockups[sp.name] = fixedProps[sp.name];
    }
  }

  // 축에 포함된 prop을 fixedProps에서 제거
  const axisNames = new Set(allAxes.map((a) => a.name));
  const filteredFixed = { ...fixedProps };
  for (const key of axisNames) {
    delete filteredFixed[key];
  }

  // 축이 없으면 단일 셀
  if (allAxes.length === 0) {
    return {
      rowAxis: null,
      colAxis: null,
      extraAxes: [] as Axis[],
      fixedProps,
      slotMockups,
    };
  }

  // 축이 1개면 col만
  if (allAxes.length === 1) {
    return {
      rowAxis: null,
      colAxis: allAxes[0],
      extraAxes: [] as Axis[],
      fixedProps: filteredFixed,
      slotMockups,
    };
  }

  // 2개 이상 → 상위 2개를 row/col, 나머지는 extra
  return {
    rowAxis: allAxes[0],
    colAxis: allAxes[1],
    extraAxes: allAxes.slice(2),
    fixedProps: filteredFixed,
    slotMockups,
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

const MAX_TOTAL = 200;

export function PropsMatrix({
  Component,
  propDefinitions,
  fixedProps,
  isLoading,
  error,
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

  const { rowAxis, colAxis, slotMockups, fixedProps: tableFixedProps } = tableData;

  // SLOT 축 값 변환: true → mockup 값, false → undefined
  const resolveSlotAxes = (props: Record<string, any>) => {
    const resolved = { ...props };
    for (const [name, mockup] of Object.entries(slotMockups)) {
      if (name in resolved) {
        resolved[name] = resolved[name] ? mockup : undefined;
      }
    }
    return resolved;
  };

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
              const props = resolveSlotAxes({ ...tableFixedProps, [colAxis.name]: colVal, ...extra });
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
                    ...tableFixedProps,
                    [rowAxis.name]: rowVal,
                    [colAxis.name]: colVal,
                  };
                  return (
                    <td key={String(colVal)} css={cellTdStyle}>
                      <div css={cellInnerStyle}>
                        {extraCombos.map((extra, ei) => {
                          const props = resolveSlotAxes({ ...cellProps, ...extra });
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
