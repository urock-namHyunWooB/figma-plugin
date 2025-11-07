import type {
  ElementBindingsMap,
  PropDefinition,
  StateDefinition,
  StructureElement,
} from "../types";

interface BindingPanelProps {
  selectedElement: StructureElement | null;
  bindings: ElementBindingsMap;
  props: PropDefinition[];
  states: StateDefinition[];
  onConnectProp: (
    elementId: string,
    elementName: string,
    elementType: string,
    propName: string | null
  ) => void;
  onSetVisibility: (
    elementId: string,
    elementName: string,
    elementType: string,
    mode: "always" | "hidden" | "expression",
    expression?: string
  ) => void;
  onSave: () => void;
  onReset: () => void;
  hasUnsavedChanges: boolean;
}

/**
 * 우측 바인딩 설정 패널 컴포넌트 (단순화)
 */
function BindingPanel({
  selectedElement,
  bindings,
  props,
  states,
  onConnectProp,
  onSetVisibility,
  onSave,
  onReset,
  hasUnsavedChanges,
}: BindingPanelProps) {
  if (!selectedElement) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
        <svg
          className="w-16 h-16 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
          />
        </svg>
        <p className="text-sm">Select an element to configure prop mapping</p>
      </div>
    );
  }

  const elementBinding = bindings[selectedElement.id];
  const connectedPropName = elementBinding?.connectedPropName || null;
  const visibleMode = elementBinding?.visibleMode || "always";
  const visibleExpression = elementBinding?.visibleExpression || "";

  const handlePropChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onConnectProp(
      selectedElement.id,
      selectedElement.name,
      selectedElement.type,
      value === "" ? null : value
    );
  };

  // 현재 선택값을 UI용으로 정규화 (기존 저장값이 prefix가 없을 수 있음)
  const normalizedSelectValue = (() => {
    if (!connectedPropName) return "";
    if (
      connectedPropName.startsWith("prop:") ||
      connectedPropName.startsWith("state:")
    ) {
      return connectedPropName;
    }
    // prefix 미포함: props 우선 확인 후 states 확인
    if (props.some((p) => p.name === connectedPropName)) {
      return `prop:${connectedPropName}`;
    }
    if (states.some((s) => s.name === connectedPropName)) {
      return `state:${connectedPropName}`;
    }
    return connectedPropName;
  })();

  const formatConnectedLabel = (value: string) => {
    if (value.startsWith("prop:")) return `[Prop] ${value.slice(5)}`;
    if (value.startsWith("state:")) return `[State] ${value.slice(6)}`;
    return value;
  };

  const handleVisibleModeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const mode = e.target.value as "always" | "hidden" | "expression";
    onSetVisibility(
      selectedElement.id,
      selectedElement.name,
      selectedElement.type,
      mode,
      mode === "expression" ? visibleExpression : undefined
    );
  };

  const handleVisibleExpressionChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const expr = e.target.value;
    onSetVisibility(
      selectedElement.id,
      selectedElement.name,
      selectedElement.type,
      "expression",
      expr
    );
  };

  const insertToken = (token: string) => {
    const base = visibleExpression || "";
    const separator = base && !base.endsWith(" ") ? " " : "";
    const next = `${base}${separator}${token}`;
    onSetVisibility(
      selectedElement.id,
      selectedElement.name,
      selectedElement.type,
      "expression",
      next
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b p-4 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-800">Prop Mapping</h2>
        <div className="mt-2 space-y-1">
          <p className="text-sm text-gray-600">
            <span className="font-medium">Name:</span> {selectedElement.name}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Type:</span> {selectedElement.type}
          </p>
          <p className="text-sm text-gray-400 text-xs">
            ID: {selectedElement.id}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Visible Settings */}
          <div className="border rounded p-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visible
            </label>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visible-mode"
                  value="always"
                  checked={visibleMode === "always"}
                  onChange={handleVisibleModeChange}
                />
                <span>Always visible</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visible-mode"
                  value="hidden"
                  checked={visibleMode === "hidden"}
                  onChange={handleVisibleModeChange}
                />
                <span>Always hidden</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visible-mode"
                  value="expression"
                  checked={visibleMode === "expression"}
                  onChange={handleVisibleModeChange}
                />
                <span>Expression</span>
              </label>

              {visibleMode === "expression" && (
                <div className="mt-2 space-y-2">
                  <input
                    type="text"
                    value={visibleExpression}
                    onChange={handleVisibleExpressionChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-xs"
                    placeholder="e.g. prop:title && state:isOpen"
                  />
                  <div className="flex flex-wrap gap-2">
                    {props.map((p) => (
                      <button
                        key={`prop-${p.id}`}
                        type="button"
                        onClick={() => insertToken(`prop:${p.name}`)}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200"
                        title="Insert prop token"
                      >
                        prop:{p.name}
                      </button>
                    ))}
                    {states.map((s) => (
                      <button
                        key={`state-${s.id}`}
                        type="button"
                        onClick={() => insertToken(`state:${s.name}`)}
                        className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded border border-purple-200"
                        title="Insert state token"
                      >
                        state:{s.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Use tokens like <span className="font-mono">prop:name</span>{" "}
                    or <span className="font-mono">state:name</span> in a
                    boolean expression.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Connect Value
            </label>
            <select
              value={normalizedSelectValue}
              onChange={handlePropChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Not connected --</option>
              {props.length > 0 && (
                <optgroup label="Props">
                  {props.map((prop) => (
                    <option key={prop.id} value={`prop:${prop.name}`}>
                      {prop.name} ({prop.type})
                    </option>
                  ))}
                </optgroup>
              )}
              {states.length > 0 && (
                <optgroup label="States">
                  {states.map((state) => (
                    <option key={state.id} value={`state:${state.name}`}>
                      {state.name} ({state.type})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {connectedPropName && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm text-green-800">
                ✓ Connected to:{" "}
                <strong>{formatConnectedLabel(normalizedSelectValue)}</strong>
              </p>
            </div>
          )}

          {!connectedPropName && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded">
              <p className="text-sm text-gray-600">
                This element is not connected to any prop yet.
              </p>
            </div>
          )}

          {/* Available Props/States Info */}
          {props.length > 0 && (
            <div className="mt-6 p-3 bg-blue-50 rounded text-xs border border-blue-200">
              <p className="font-semibold text-blue-900 mb-2">
                Available Props ({props.length}):
              </p>
              <div className="space-y-1">
                {props.map((prop) => (
                  <div key={prop.id} className="text-blue-800">
                    • <span className="font-medium">{prop.name}</span>:{" "}
                    {prop.type}
                    {prop.description && (
                      <span className="text-blue-600">
                        {" "}
                        - {prop.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {states.length > 0 && (
            <div className="mt-2 p-3 bg-purple-50 rounded text-xs border border-purple-200">
              <p className="font-semibold text-purple-900 mb-2">
                Available States ({states.length}):
              </p>
              <div className="space-y-1">
                {states.map((state) => (
                  <div key={state.id} className="text-purple-800">
                    • <span className="font-medium">{state.name}</span>:{" "}
                    {state.type}
                    {state.description && (
                      <span className="text-purple-600">
                        {" "}
                        - {state.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {props.length === 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                ⚠ No props defined yet. Add props in the "Props 설정" section
                above.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t p-4 bg-gray-50">
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={!hasUnsavedChanges}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              hasUnsavedChanges
                ? "bg-green-500 hover:bg-green-600 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            Save Mappings
          </button>
          {hasUnsavedChanges && (
            <button
              onClick={onReset}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BindingPanel;
