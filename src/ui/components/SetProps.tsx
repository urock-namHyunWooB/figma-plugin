import { useState, useEffect } from "react";
import {
  PropDefinition,
  isFormValid,
  getNameError,
  getDefaultValueError,
} from "../utils/validation";
import { getPropTypeBgColor } from "../utils/propStyles";

function SetProps() {
  const [props, setProps] = useState<PropDefinition[]>([]);
  const [savedProps, setSavedProps] = useState<PropDefinition[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
    new Set()
  );

  // Load saved props definition from plugin
  useEffect(() => {
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;

      if (msg.type === "props-definition") {
        if (msg.data) {
          setProps(msg.data);
          setSavedProps(msg.data);
          setIsEditing(false);
        } else {
          setProps([]);
          setSavedProps([]);
        }
      }
    };
  }, []);

  const addProp = () => {
    const newProp: PropDefinition = {
      id: `prop-${Date.now()}`,
      name: "",
      type: "string",
      defaultValue: "",
      required: false,
      description: "",
    };
    setProps([...props, newProp]);
  };

  const removeProp = (id: string) => {
    setProps(props.filter((p) => p.id !== id));
    setExpandedDescriptions((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  // Update prop field
  const updateProp = (id: string, field: keyof PropDefinition, value: any) => {
    setProps(props.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  // Toggle description visibility
  const toggleDescription = (id: string) => {
    setExpandedDescriptions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };


  // Save handler
  const handleSave = () => {
    if (!isFormValid(props)) return;

    parent.postMessage(
      {
        pluginMessage: {
          type: "save-props-definition",
          data: props,
        },
      },
      "*"
    );
  };

  // Reset handler
  const handleReset = () => {
    if (confirm("모든 Props 설정을 초기화하시겠습니까?")) {
      setProps([]);
      setSavedProps([]);
      setIsEditing(true);
      parent.postMessage(
        {
          pluginMessage: {
            type: "save-props-definition",
            data: [],
          },
        },
        "*"
      );
    }
  };

  // Edit handler
  const handleEdit = () => {
    setIsEditing(true);
  };

  // Cancel edit handler
  const handleCancelEdit = () => {
    setProps([...savedProps]);
    setIsEditing(false);
    setExpandedDescriptions(new Set());
  };

  // Edit specific prop
  const handleEditProp = (propId: string) => {
    setIsEditing(true);
    // Auto-focus는 DOM이 렌더링된 후에 처리됨
  };

  // Render default value input based on type
  const renderDefaultValueInput = (prop: PropDefinition) => {
    switch (prop.type) {
      case "boolean":
        return (
          <button
            onClick={() =>
              updateProp(prop.id, "defaultValue", !prop.defaultValue)
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              prop.defaultValue ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                prop.defaultValue ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        );

      case "number":
        return (
          <input
            type="number"
            value={prop.defaultValue || ""}
            onChange={(e) =>
              updateProp(
                prop.id,
                "defaultValue",
                e.target.value ? Number(e.target.value) : ""
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded"
            placeholder="기본값 입력"
          />
        );

      case "object":
      case "array":
        return (
          <textarea
            value={
              typeof prop.defaultValue === "string"
                ? prop.defaultValue
                : JSON.stringify(prop.defaultValue, null, 2) || ""
            }
            onChange={(e) =>
              updateProp(prop.id, "defaultValue", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm"
            placeholder={
              prop.type === "object" ? '{"key": "value"}' : '["item"]'
            }
            rows={3}
          />
        );

      default:
        // string, component, function
        return (
          <input
            type="text"
            value={prop.defaultValue || ""}
            onChange={(e) =>
              updateProp(prop.id, "defaultValue", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded"
            placeholder={
              prop.type === "component"
                ? "ComponentName"
                : prop.type === "function"
                ? "handleClick"
                : "기본값 입력"
            }
          />
        );
    }
  };


  // Render prop chip
  const renderPropChip = (prop: PropDefinition) => {
    return (
      <button
        key={prop.id}
        onClick={() => handleEditProp(prop.id)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:shadow-md ${getPropTypeBgColor(prop.type)}`}
        title={prop.description || "클릭하여 수정"}
      >
        <span className="font-semibold">{prop.name}</span>
        <span className="opacity-70">: {prop.type}</span>
        {prop.required && <span className="text-xs font-bold">*</span>}
      </button>
    );
  };

  return (
    <div className="mb-4 p-4 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Props 설정</h2>
        {!isEditing && savedProps.length > 0 ? (
          <button
            onClick={handleEdit}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
          >
            편집
          </button>
        ) : (
          <button
            onClick={addProp}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
          >
            + Add Prop
          </button>
        )}
      </div>

      {!isEditing && savedProps.length > 0 ? (
        // Chip view (saved state)
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {savedProps.map((prop) => renderPropChip(prop))}
          </div>
          <div className="pt-2 border-t flex gap-2">
            <button
              onClick={handleEdit}
              className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-medium transition-colors"
            >
              Props 수정
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-colors"
            >
              초기화
            </button>
          </div>
        </div>
      ) : props.length === 0 ? (
        <div className="text-gray-400 text-center py-4">
          아직 정의된 Props가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {props.map((prop) => {
            const nameError = getNameError(prop, props);
            const defaultValueError = getDefaultValueError(prop);

            return (
              <div key={prop.id} className="border rounded p-3 space-y-3">
                {/* Name and Delete Button */}
                <div className="space-y-1">
                  <div className="flex justify-between items-start gap-2">
                    <input
                      type="text"
                      value={prop.name}
                      onChange={(e) =>
                        updateProp(prop.id, "name", e.target.value)
                      }
                      className={`flex-1 px-3 py-2 border rounded font-medium ${
                        nameError ? "border-red-500" : "border-gray-300"
                      }`}
                      placeholder="prop 이름 (예: onClick, color)"
                    />
                    <button
                      onClick={() => removeProp(prop.id)}
                      className="px-2 py-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="삭제"
                    >
                      ✕
                    </button>
                  </div>
                  {nameError && (
                    <p className="text-red-500 text-xs">{nameError}</p>
                  )}
                </div>

                {/* Type Select */}
                <div className="space-y-1">
                  <label className="text-sm text-gray-700 font-medium">
                    Type
                  </label>
                  <select
                    value={prop.type}
                    onChange={(e) =>
                      updateProp(
                        prop.id,
                        "type",
                        e.target.value as PropDefinition["type"]
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="object">object</option>
                    <option value="array">array</option>
                    <option value="component">component</option>
                    <option value="function">function</option>
                  </select>
                </div>

                {/* Required Checkbox */}
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-700 font-medium">
                    Required
                  </label>
                  <button
                    onClick={() =>
                      updateProp(prop.id, "required", !prop.required)
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      prop.required ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        prop.required ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Default Value */}
                <div className="space-y-1">
                  <label className="text-sm text-gray-700 font-medium">
                    Default Value
                  </label>
                  {renderDefaultValueInput(prop)}
                  {defaultValueError && (
                    <p className="text-red-500 text-xs">{defaultValueError}</p>
                  )}
                </div>

                {/* Description Toggle */}
                <div>
                  <button
                    onClick={() => toggleDescription(prop.id)}
                    className="text-sm text-blue-500 hover:text-blue-600"
                  >
                    {expandedDescriptions.has(prop.id)
                      ? "− Description 숨기기"
                      : "+ Description 추가"}
                  </button>
                  {expandedDescriptions.has(prop.id) && (
                    <textarea
                      value={prop.description || ""}
                      onChange={(e) =>
                        updateProp(prop.id, "description", e.target.value)
                      }
                      className="w-full mt-2 px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="이 prop에 대한 설명을 입력하세요"
                      rows={2}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Save and Cancel Buttons */}
      {props.length > 0 && isEditing && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!isFormValid(props)}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              isFormValid(props)
                ? "bg-green-500 hover:bg-green-600 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            저장
          </button>
          {savedProps.length > 0 && (
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
            >
              취소
            </button>
          )}
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg font-medium transition-colors"
          >
            초기화
          </button>
        </div>
      )}
    </div>
  );
}

export default SetProps;
