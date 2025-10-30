import { useState, useEffect } from "react";
import { getPropTypeBgColor } from "../utils/propStyles";
import { StateDefinition } from "../domain/component-structure/types";

function SetInternalState({ savedStates }: { savedStates: StateDefinition[] }) {
  const [states, setStates] = useState<StateDefinition[]>([]);

  const [isEditing, setIsEditing] = useState(false);
  const [editingStateId, setEditingStateId] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
    new Set()
  );

  // Load saved state definition from plugin
  useEffect(() => {
    setStates(savedStates);
  }, [savedStates]);

  const addState = () => {
    const newState: StateDefinition = {
      id: `state-${Date.now()}`,
      name: "",
      type: "string",
      initialValue: "",
      description: "",
    };
    setStates([...states, newState]);
    setIsEditing(true);
    setEditingStateId(newState.id);
  };

  const removeState = (id: string) => {
    setStates(states.filter((s) => s.id !== id));
    setExpandedDescriptions((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    if (editingStateId === id) {
      setEditingStateId(null);
      setIsEditing(false);
    }
  };

  // Update state field
  const updateState = (
    id: string,
    field: keyof StateDefinition,
    value: any
  ) => {
    setStates(
      states.map((s) => {
        if (s.id === id) {
          const updated = { ...s, [field]: value };
          return updated;
        }
        return s;
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

  // Validation for state
  const getStateNameError = (
    state: StateDefinition,
    allStates: StateDefinition[]
  ) => {
    if (!state.name.trim()) {
      return "상태 이름을 입력해주세요.";
    }
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(state.name)) {
      return "유효한 JavaScript 변수명을 입력해주세요.";
    }
    const duplicates = allStates.filter(
      (s) => s.name === state.name && s.id !== state.id
    );
    if (duplicates.length > 0) {
      return "이미 사용 중인 이름입니다.";
    }
    return null;
  };

  const getInitialValueError = (state: StateDefinition) => {
    // initialValue는 항상 필요
    if (state.type === "boolean") {
      return null; // boolean은 toggle로 처리
    }

    if (state.type === "object" || state.type === "array") {
      if (!state.initialValue) {
        return "초기값을 입력해주세요.";
      }
      try {
        JSON.parse(state.initialValue);
      } catch {
        return "유효한 JSON 형식이 아닙니다.";
      }
    }

    if (state.type === "number") {
      if (state.initialValue === "" || state.initialValue == null) {
        return "초기값을 입력해주세요.";
      }
    }

    if (state.type === "string") {
      // string은 빈 문자열도 허용
    }

    return null;
  };

  const isStateFormValid = (stateList: StateDefinition[]) => {
    return stateList.every((state) => {
      return (
        !getStateNameError(state, stateList) && !getInitialValueError(state)
      );
    });
  };

  // Save handler
  const handleSave = () => {
    if (!isStateFormValid(states)) return;

    parent.postMessage(
      {
        pluginMessage: {
          type: "save-internal-state-definition",
          data: states,
        },
      },
      "*"
    );
    setIsEditing(false);
    setEditingStateId(null);
    setExpandedDescriptions(new Set());
  };

  // Reset handler
  const handleReset = () => {
    if (confirm("모든 내부 상태 설정을 초기화하시겠습니까?")) {
      setStates([]);
      setIsEditing(false);
      setEditingStateId(null);
      parent.postMessage(
        {
          pluginMessage: {
            type: "save-internal-state-definition",
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
    setEditingStateId(null); // 전체 편집 모드
  };

  // Cancel edit handler
  const handleCancelEdit = () => {
    setStates([...savedStates]);
    setIsEditing(false);
    setEditingStateId(null);
    setExpandedDescriptions(new Set());
  };

  // Edit specific state
  const handleEditState = (stateId: string) => {
    setIsEditing(true);
    setEditingStateId(stateId);
  };

  // Render initial value input based on type
  const renderInitialValueInput = (state: StateDefinition) => {
    switch (state.type) {
      case "boolean":
        return (
          <button
            onClick={() =>
              updateState(state.id, "initialValue", !state.initialValue)
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              state.initialValue ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                state.initialValue ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        );

      case "number":
        return (
          <input
            type="number"
            value={state.initialValue || ""}
            onChange={(e) =>
              updateState(
                state.id,
                "initialValue",
                e.target.value ? Number(e.target.value) : ""
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded"
            placeholder="초기값 입력 (필수)"
          />
        );

      case "object":
      case "array":
        return (
          <textarea
            value={
              typeof state.initialValue === "string"
                ? state.initialValue
                : JSON.stringify(state.initialValue, null, 2) || ""
            }
            onChange={(e) =>
              updateState(state.id, "initialValue", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm"
            placeholder={
              state.type === "object" ? '{"key": "value"}' : '["item"]'
            }
            rows={3}
          />
        );

      default:
        // string
        return (
          <input
            type="text"
            value={state.initialValue || ""}
            onChange={(e) =>
              updateState(state.id, "initialValue", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded"
            placeholder="초기값 입력"
          />
        );
    }
  };

  // Render state chip
  const renderStateChip = (state: StateDefinition) => {
    const getDisplayValue = () => {
      if (state.type === "boolean") {
        return state.initialValue ? "true" : "false";
      }
      if (state.type === "object" || state.type === "array") {
        return state.type;
      }
      if (state.type === "number") {
        return state.initialValue?.toString() || "0";
      }
      return state.initialValue || '""';
    };

    return (
      <button
        key={state.id}
        onClick={() => handleEditState(state.id)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:shadow-md ${getPropTypeBgColor(
          state.type
        )}`}
        title={state.description || "클릭하여 수정"}
      >
        <span className="font-semibold">{state.name}</span>
        <span className="opacity-70 font-mono text-xs">
          : {state.type} = {getDisplayValue()}
        </span>
      </button>
    );
  };

  // Render editing form for a specific state
  const renderStateForm = (state: StateDefinition) => {
    const nameError = getStateNameError(state, states);
    const initialValueError = getInitialValueError(state);

    return (
      <div key={state.id} className="border rounded p-3 space-y-3">
        {/* Name and Delete Button */}
        <div className="space-y-1">
          <div className="flex justify-between items-start gap-2">
            <input
              type="text"
              value={state.name}
              onChange={(e) => updateState(state.id, "name", e.target.value)}
              className={`flex-1 px-3 py-2 border rounded font-medium ${
                nameError ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="상태 이름 (예: count, isOpen)"
              autoFocus
            />
            <button
              onClick={() => removeState(state.id)}
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
            value={state.type}
            onChange={(e) =>
              updateState(
                state.id,
                "type",
                e.target.value as StateDefinition["type"]
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded"
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="object">object</option>
            <option value="array">array</option>
          </select>
        </div>

        {/* Initial Value */}
        <div className="space-y-1">
          <label className="text-sm text-gray-700 font-medium">
            Initial Value
          </label>
          {renderInitialValueInput(state)}
          {initialValueError && (
            <p className="text-red-500 text-xs">{initialValueError}</p>
          )}
        </div>

        {/* Description Toggle */}
        <div>
          <button
            onClick={() => toggleDescription(state.id)}
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            {expandedDescriptions.has(state.id)
              ? "− Description 숨기기"
              : "+ Description 추가"}
          </button>
          {expandedDescriptions.has(state.id) && (
            <textarea
              value={state.description || ""}
              onChange={(e) =>
                updateState(state.id, "description", e.target.value)
              }
              className="w-full mt-2 px-3 py-2 border border-gray-300 rounded text-sm"
              placeholder="이 상태에 대한 설명을 입력하세요"
              rows={2}
            />
          )}
        </div>

        {/* Save and Cancel Buttons for single state */}
        <div className="flex gap-2 pt-2 border-t">
          <button
            onClick={handleSave}
            disabled={!isStateFormValid(states)}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              isStateFormValid(states)
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
        <h2 className="text-lg font-semibold">내부 상태 설정</h2>
        {!isEditing && (
          <button
            onClick={addState}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
          >
            + Add State
          </button>
        )}
      </div>

      {!isEditing && states.length > 0 ? (
        // Chip view (saved state)
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {savedStates.map((state) => renderStateChip(state))}
          </div>
          <div className="pt-2 border-t flex gap-2">
            <button
              onClick={handleEdit}
              className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-medium transition-colors"
            >
              상태 수정
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-colors"
            >
              초기화
            </button>
          </div>
        </div>
      ) : states.length === 0 ? (
        <div className="text-gray-400 text-center py-4">
          아직 정의된 내부 상태가 없습니다.
        </div>
      ) : isEditing && editingStateId ? (
        // Single state editing mode
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {states
              .filter((state) => state.id !== editingStateId)
              .map((state) => renderStateChip(state))}
          </div>
          {states
            .filter((state) => state.id === editingStateId)
            .map((state) => renderStateForm(state))}
        </div>
      ) : (
        // Full editing mode (all states)
        <div className="space-y-3">
          {states.map((state) => {
            const nameError = getStateNameError(state, states);
            const initialValueError = getInitialValueError(state);

            return (
              <div key={state.id} className="border rounded p-3 space-y-3">
                {/* Name and Delete Button */}
                <div className="space-y-1">
                  <div className="flex justify-between items-start gap-2">
                    <input
                      type="text"
                      value={state.name}
                      onChange={(e) =>
                        updateState(state.id, "name", e.target.value)
                      }
                      className={`flex-1 px-3 py-2 border rounded font-medium ${
                        nameError ? "border-red-500" : "border-gray-300"
                      }`}
                      placeholder="상태 이름 (예: count, isOpen)"
                    />
                    <button
                      onClick={() => removeState(state.id)}
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
                    value={state.type}
                    onChange={(e) =>
                      updateState(
                        state.id,
                        "type",
                        e.target.value as StateDefinition["type"]
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="object">object</option>
                    <option value="array">array</option>
                  </select>
                </div>

                {/* Initial Value */}
                <div className="space-y-1">
                  <label className="text-sm text-gray-700 font-medium">
                    Initial Value
                  </label>
                  {renderInitialValueInput(state)}
                  {initialValueError && (
                    <p className="text-red-500 text-xs">{initialValueError}</p>
                  )}
                </div>

                {/* Description Toggle */}
                <div>
                  <button
                    onClick={() => toggleDescription(state.id)}
                    className="text-sm text-blue-500 hover:text-blue-600"
                  >
                    {expandedDescriptions.has(state.id)
                      ? "− Description 숨기기"
                      : "+ Description 추가"}
                  </button>
                  {expandedDescriptions.has(state.id) && (
                    <textarea
                      value={state.description || ""}
                      onChange={(e) =>
                        updateState(state.id, "description", e.target.value)
                      }
                      className="w-full mt-2 px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="이 상태에 대한 설명을 입력하세요"
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
      {states.length > 0 && isEditing && !editingStateId && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!isStateFormValid(states)}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              isStateFormValid(states)
                ? "bg-green-500 hover:bg-green-600 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            저장
          </button>
          {savedStates.length > 0 && (
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

export default SetInternalState;
