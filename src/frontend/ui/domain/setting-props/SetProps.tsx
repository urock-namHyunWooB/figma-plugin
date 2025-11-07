import { useState, useEffect } from "react";
import {
  FunctionParameter,
  isFormValid,
  getNameError,
  getDefaultValueError,
  PropDefinition,
} from "../../utils/validation";
import { getPropTypeBgColor } from "../../utils/propStyles";
import { MESSAGE_TYPES } from "@backend";

function SetProps({ savedProps }: { savedProps: PropDefinition[] }) {
  const [props, setProps] = useState<PropDefinition[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    setProps(savedProps);
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
    setIsEditing(true);
    setEditingPropId(newProp.id);
  };

  const removeProp = (id: string) => {
    // readonly props는 삭제할 수 없음
    const propToRemove = props.find((p) => p.id === id);
    if (propToRemove?.readonly) {
      return;
    }

    setProps(props.filter((p) => p.id !== id));
    setExpandedDescriptions((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    if (editingPropId === id) {
      setEditingPropId(null);
      setIsEditing(false);
    }
  };

  // Update prop field
  const updateProp = (id: string, field: keyof PropDefinition, value: any) => {
    setProps(
      props.map((p) => {
        if (p.id === id) {
          // readonly props는 수정할 수 없음
          if (p.readonly) {
            return p;
          }

          const updated = { ...p, [field]: value };
          // function 타입으로 변경될 때 초기화
          if (field === "type" && value === "function") {
            updated.parameters = updated.parameters || [];
            updated.returnType = updated.returnType || "void";
          }
          return updated;
        }
        return p;
      })
    );
  };

  // Add parameter to function prop
  const addParameter = (propId: string) => {
    setProps(
      props.map((p) => {
        if (p.id === propId) {
          const newParam: FunctionParameter = {
            id: `param-${Date.now()}`,
            name: "",
            type: "any",
          };
          return {
            ...p,
            parameters: [...(p.parameters || []), newParam],
          };
        }
        return p;
      })
    );
  };

  // Remove parameter from function prop
  const removeParameter = (propId: string, paramId: string) => {
    setProps(
      props.map((p) => {
        if (p.id === propId) {
          return {
            ...p,
            parameters: (p.parameters || []).filter(
              (param) => param.id !== paramId
            ),
          };
        }
        return p;
      })
    );
  };

  // Update parameter
  const updateParameter = (
    propId: string,
    paramId: string,
    field: keyof FunctionParameter,
    value: string
  ) => {
    setProps(
      props.map((p) => {
        if (p.id === propId) {
          return {
            ...p,
            parameters: (p.parameters || []).map((param) =>
              param.id === paramId ? { ...param, [field]: value } : param
            ),
          };
        }
        return p;
      })
    );
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
    setIsEditing(false);
    setEditingPropId(null);
    setExpandedDescriptions(new Set());
  };

  // Reset handler
  const handleReset = () => {
    if (confirm("모든 Props 설정을 초기화하시겠습니까?")) {
      setProps([]);
      setIsEditing(false);
      setEditingPropId(null);
      parent.postMessage(
        {
          pluginMessage: {
            type: MESSAGE_TYPES.SAVE_PROPS_DEFINITION,
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
    setEditingPropId(null); // 전체 편집 모드
  };

  // Cancel edit handler
  const handleCancelEdit = () => {
    setProps([...savedProps]);
    setIsEditing(false);
    setEditingPropId(null);
    setExpandedDescriptions(new Set());
  };

  // Edit specific prop
  const handleEditProp = (propId: string) => {
    setIsEditing(true);
    setEditingPropId(propId);
  };

  // Render default value input based on type
  const renderDefaultValueInput = (prop: PropDefinition) => {
    switch (prop.type) {
      case "boolean":
        return (
          <button
            onClick={() =>
              !prop.required &&
              updateProp(prop.id, "defaultValue", !prop.defaultValue)
            }
            disabled={prop.required}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              prop.required
                ? "bg-gray-200 opacity-50 cursor-not-allowed"
                : prop.defaultValue
                ? "bg-blue-600"
                : "bg-gray-200"
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
            disabled={prop.required}
            className="w-full px-3 py-2 border border-gray-300 rounded disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
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
            disabled={prop.required}
            className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
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
            disabled={prop.required}
            className="w-full px-3 py-2 border border-gray-300 rounded disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
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
    const getFunctionSignature = () => {
      if (prop.type !== "function") return prop.type;

      const params = (prop.parameters || [])
        .map((p) => `${p.name}: ${p.type}`)
        .join(", ");
      const returnType = prop.returnType || "void";
      return `(${params}) => ${returnType}`;
    };

    return (
      <button
        key={prop.id}
        onClick={() => !prop.readonly && handleEditProp(prop.id)}
        disabled={prop.readonly}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
          prop.readonly
            ? "bg-gray-200 text-gray-700 cursor-not-allowed opacity-75"
            : `hover:shadow-md ${getPropTypeBgColor(prop.type)}`
        }`}
        title={
          prop.readonly
            ? "Variant property (편집 불가)"
            : prop.description || "클릭하여 수정"
        }
      >
        {prop.readonly && <span className="text-xs">🔒</span>}
        <span className="font-semibold">{prop.name}</span>
        <span className="opacity-70 font-mono text-xs">
          : {getFunctionSignature()}
        </span>
        {prop.required && <span className="text-xs font-bold">*</span>}
      </button>
    );
  };

  // Render editing form for a specific prop
  const renderPropForm = (prop: PropDefinition) => {
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
              onChange={(e) => updateProp(prop.id, "name", e.target.value)}
              className={`flex-1 px-3 py-2 border rounded font-medium ${
                nameError ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="prop 이름 (예: onClick, color)"
              autoFocus
            />
            <button
              onClick={() => removeProp(prop.id)}
              className="px-2 py-2 text-red-500 hover:bg-red-50 rounded transition-colors"
              title="삭제"
            >
              ✕
            </button>
          </div>
          {nameError && <p className="text-red-500 text-xs">{nameError}</p>}
        </div>

        {/* Type Select */}
        <div className="space-y-1">
          <label className="text-sm text-gray-700 font-medium">Type</label>
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
          <label className="text-sm text-gray-700 font-medium">Required</label>
          <button
            onClick={() => updateProp(prop.id, "required", !prop.required)}
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

        {/* Function Parameters (only for function type) */}
        {prop.type === "function" && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm text-gray-700 font-medium">
                Parameters
              </label>
              <button
                onClick={() => addParameter(prop.id)}
                className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors"
              >
                + Add Parameter
              </button>
            </div>
            {(prop.parameters || []).length > 0 ? (
              <div className="space-y-2 pl-2 border-l-2 border-gray-200">
                {(prop.parameters || []).map((param) => (
                  <div key={param.id} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={param.name}
                      onChange={(e) =>
                        updateParameter(
                          prop.id,
                          param.id,
                          "name",
                          e.target.value
                        )
                      }
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      placeholder="param name"
                    />
                    <input
                      type="text"
                      value={param.type}
                      onChange={(e) =>
                        updateParameter(
                          prop.id,
                          param.id,
                          "type",
                          e.target.value
                        )
                      }
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      placeholder="type"
                    />
                    <button
                      onClick={() => removeParameter(prop.id, param.id)}
                      className="px-2 py-1 text-red-500 hover:bg-red-50 rounded text-sm transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No parameters</p>
            )}
          </div>
        )}

        {/* Function Return Type (only for function type) */}
        {prop.type === "function" && (
          <div className="space-y-1">
            <label className="text-sm text-gray-700 font-medium">
              Return Type
            </label>
            <input
              type="text"
              value={prop.returnType || "void"}
              onChange={(e) =>
                updateProp(prop.id, "returnType", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded"
              placeholder="void, string, number, etc."
            />
          </div>
        )}

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

        {/* Save and Cancel Buttons for single prop */}
        <div className="flex gap-2 pt-2 border-t">
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
          <button
            onClick={handleCancelEdit}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mb-4 p-4 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Props 설정</h2>
        {!isEditing && (
          <button
            onClick={addProp}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
          >
            + Add Prop
          </button>
        )}
      </div>

      {!isEditing && savedProps.length > 0 ? (
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
      ) : isEditing && editingPropId ? (
        // Single prop editing mode
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {props
              .filter((prop) => prop.id !== editingPropId)
              .map((prop) => renderPropChip(prop))}
          </div>
          {props
            .filter((prop) => prop.id === editingPropId)
            .map((prop) => renderPropForm(prop))}
        </div>
      ) : (
        // Full editing mode (all props)
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

                {/* Function Parameters (only for function type) */}
                {prop.type === "function" && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm text-gray-700 font-medium">
                        Parameters
                      </label>
                      <button
                        onClick={() => addParameter(prop.id)}
                        className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                      >
                        + Add Parameter
                      </button>
                    </div>
                    {(prop.parameters || []).length > 0 ? (
                      <div className="space-y-2 pl-2 border-l-2 border-gray-200">
                        {(prop.parameters || []).map((param) => (
                          <div
                            key={param.id}
                            className="flex gap-2 items-start"
                          >
                            <input
                              type="text"
                              value={param.name}
                              onChange={(e) =>
                                updateParameter(
                                  prop.id,
                                  param.id,
                                  "name",
                                  e.target.value
                                )
                              }
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                              placeholder="param name"
                            />
                            <input
                              type="text"
                              value={param.type}
                              onChange={(e) =>
                                updateParameter(
                                  prop.id,
                                  param.id,
                                  "type",
                                  e.target.value
                                )
                              }
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                              placeholder="type"
                            />
                            <button
                              onClick={() => removeParameter(prop.id, param.id)}
                              className="px-2 py-1 text-red-500 hover:bg-red-50 rounded text-sm transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        No parameters
                      </p>
                    )}
                  </div>
                )}

                {/* Function Return Type (only for function type) */}
                {prop.type === "function" && (
                  <div className="space-y-1">
                    <label className="text-sm text-gray-700 font-medium">
                      Return Type
                    </label>
                    <input
                      type="text"
                      value={prop.returnType || "void"}
                      onChange={(e) =>
                        updateProp(prop.id, "returnType", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                      placeholder="void, string, number, etc."
                    />
                  </div>
                )}

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

      {/* Save and Cancel Buttons for full edit mode */}
      {props.length > 0 && isEditing && !editingPropId && (
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
