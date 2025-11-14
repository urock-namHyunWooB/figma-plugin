interface PropsPanelProps {
  componentProps: Record<string, any>;
  onPropChange: (propName: string, value: any) => void;
}

/**
 * Props 편집 패널
 */
export function PropsPanel({ componentProps, onPropChange }: PropsPanelProps) {
  return (
    <div className="w-80 bg-white border-l p-4 overflow-y-auto">
      <h3 className="font-semibold mb-4">Component Props</h3>

      {Object.keys(componentProps).length === 0 ? (
        <div className="text-sm text-gray-400">No props defined</div>
      ) : (
        <div className="space-y-3">
          {Object.entries(componentProps).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-gray-700">{key}</label>

              {typeof value === "boolean" ? (
                <button
                  onClick={() => onPropChange(key, !value)}
                  className={`w-full text-left px-3 py-2 rounded border ${
                    value
                      ? "bg-green-50 border-green-300"
                      : "bg-gray-50 border-gray-300"
                  }`}
                >
                  {value ? "true" : "false"}
                </button>
              ) : typeof value === "number" ? (
                <input
                  type="number"
                  value={value}
                  onChange={(e) => onPropChange(key, Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded"
                />
              ) : (
                <input
                  type="text"
                  value={value || ""}
                  onChange={(e) => onPropChange(key, e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder={`Enter ${key}`}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
