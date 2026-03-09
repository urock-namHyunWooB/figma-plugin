import React from "react";
import { css } from "@emotion/react";
import type { PropDefinition } from "@code-generator2";

interface PropControllerProps {
  propDefinitions: PropDefinition[];
  propValues: Record<string, any>;
  onPropChange: (name: string, value: any) => void;
  /** SLOT 목업 활성화 상태 */
  slotMockupEnabled?: Record<string, boolean>;
  /** SLOT 목업 토글 핸들러 */
  onSlotMockupToggle?: (name: string, enabled: boolean) => void;
}

const containerStyle = css`
  padding: 16px;
  background: #1e1e1e;
  border-radius: 8px;
`;

const titleStyle = css`
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 16px;
`;

const propRowStyle = css`
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
`;

const labelStyle = css`
  min-width: 100px;
  font-size: 13px;
  color: #a0a0a0;
  font-family: "JetBrains Mono", monospace;
`;

const selectStyle = css`
  flex: 1;
  padding: 8px 12px;
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    border-color: #606060;
  }

  &:focus {
    outline: none;
    border-color: #0078d4;
  }
`;

const inputStyle = css`
  flex: 1;
  padding: 8px 12px;
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;

  &:hover {
    border-color: #606060;
  }

  &:focus {
    outline: none;
    border-color: #0078d4;
  }
`;

const checkboxContainerStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const checkboxStyle = css`
  width: 18px;
  height: 18px;
  cursor: pointer;
`;

const slotContainerStyle = css`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const slotLabelStyle = css`
  padding: 6px 10px;
  background: #2d2d2d;
  border: 1px dashed #0078d4;
  border-radius: 4px;
  color: #0078d4;
  font-size: 12px;
  flex: 1;
`;

const slotToggleStyle = css`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #808080;
`;

const jsonInputStyle = css`
  flex: 1;
  padding: 8px 12px;
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
  font-family: "JetBrains Mono", monospace;
  min-height: 32px;
  resize: vertical;

  &:hover {
    border-color: #606060;
  }

  &:focus {
    outline: none;
    border-color: #0078d4;
  }
`;

export function PropController({
  propDefinitions,
  propValues,
  onPropChange,
  slotMockupEnabled = {},
  onSlotMockupToggle,
}: PropControllerProps) {
  const renderControl = (prop: PropDefinition) => {
    const value = propValues[prop.name] ?? prop.defaultValue;

    switch (prop.type) {
      case "function":
        return null;

      case "VARIANT":
        return (
          <select
            css={selectStyle}
            value={value}
            onChange={(e) => onPropChange(prop.name, e.target.value)}
          >
            {prop.variantOptions?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case "TEXT":
        return (
          <input
            type="text"
            css={inputStyle}
            value={value ?? ""}
            onChange={(e) => onPropChange(prop.name, e.target.value)}
            placeholder={`Enter ${prop.name}...`}
          />
        );

      case "BOOLEAN": {
        // extraValues가 있으면 tri-state select (예: true / false / "indeterminate")
        if (prop.extraValues && prop.extraValues.length > 0) {
          return (
            <select
              css={selectStyle}
              value={String(value ?? false)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "true") onPropChange(prop.name, true);
                else if (v === "false") onPropChange(prop.name, false);
                else onPropChange(prop.name, v);
              }}
            >
              <option value="false">false</option>
              <option value="true">true</option>
              {prop.extraValues.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          );
        }
        return (
          <div css={checkboxContainerStyle}>
            <input
              type="checkbox"
              css={checkboxStyle}
              checked={!!value}
              onChange={(e) => onPropChange(prop.name, e.target.checked)}
            />
            <span style={{ color: "#a0a0a0", fontSize: 13 }}>
              {value ? "true" : "false"}
            </span>
          </div>
        );
      }

      case "SLOT": {
        // Array slot: JSON 텍스트 입력 (Storybook 스타일)
        if (prop.arraySlotInfo) {
          const jsonStr = Array.isArray(value) ? JSON.stringify(value, null, 2) : "[]";
          return (
            <textarea
              css={jsonInputStyle}
              defaultValue={jsonStr}
              rows={Math.min(Math.max(jsonStr.split("\n").length, 2), 8)}
              onBlur={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  if (Array.isArray(parsed)) {
                    onPropChange(prop.name, parsed);
                  }
                } catch {
                  // JSON 파싱 실패 시 무시
                }
              }}
              placeholder={`[{"${prop.arraySlotInfo.itemProps.map((p) => p.name).join('", "')}": ...}]`}
            />
          );
        }

        // 단일 slot: 기존 mockup 로직
        const isEnabled = slotMockupEnabled[prop.name] ?? true;
        const componentName = prop.slotInfo?.componentName || prop.name;
        return (
          <div css={slotContainerStyle}>
            <div css={slotLabelStyle}>
              {componentName}
            </div>
            <label css={slotToggleStyle}>
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => onSlotMockupToggle?.(prop.name, e.target.checked)}
                style={{ width: 14, height: 14, cursor: "pointer" }}
              />
              Mockup
            </label>
          </div>
        );
      }

      default:
        return (
          <input
            type="text"
            css={inputStyle}
            value={String(value ?? "")}
            onChange={(e) => onPropChange(prop.name, e.target.value)}
          />
        );
    }
  };

  return (
    <div css={containerStyle}>
      <div css={titleStyle}>Props Control</div>
      {propDefinitions
        .filter((prop) => prop.type !== "function")
        .map((prop) => (
        <div key={prop.name} css={propRowStyle}>
          <label css={labelStyle}>{prop.name}</label>
          {renderControl(prop)}
        </div>
      ))}
    </div>
  );
}

export default PropController;

