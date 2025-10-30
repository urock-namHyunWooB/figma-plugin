import type {
  ElementBindingsMap,
  PropDefinition,
  StructureElement,
} from "../types";

interface BindingPanelProps {
  selectedElement: StructureElement | null;
  bindings: ElementBindingsMap;
  props: PropDefinition[];
  onConnectProp: (
    elementId: string,
    elementName: string,
    elementType: string,
    propName: string | null
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
  onConnectProp,
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

  const handlePropChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onConnectProp(
      selectedElement.id,
      selectedElement.name,
      selectedElement.type,
      value === "" ? null : value
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Connect to Prop
            </label>
            <select
              value={connectedPropName || ""}
              onChange={handlePropChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Not connected --</option>
              {props.map((prop) => (
                <option key={prop.id} value={prop.name}>
                  {prop.name} ({prop.type})
                </option>
              ))}
            </select>
          </div>

          {connectedPropName && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm text-green-800">
                ✓ Connected to: <strong>{connectedPropName}</strong>
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

          {/* Available Props Info */}
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
