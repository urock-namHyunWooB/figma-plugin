import { useState, useEffect } from "react";

// 프로퍼티 설정 인터페이스
interface PropertyConfig {
  name: string;
  type: "BOOLEAN" | "TEXT" | "VARIANT";
  required: boolean;
  is_prop: boolean;
  initValue: string | boolean | null;
  variantOptions?: string[];
}

function ComponentProperty({
  componentSetInfo,
  savedConfig,
}: {
  componentSetInfo: ComponentPropertyDefinitions;
  savedConfig: PropertyConfig[] | null;
}) {
  const [properties, setProperties] = useState<PropertyConfig[]>([]);

  // componentSetInfo를 PropertyConfig[]로 변환
  useEffect(() => {
    if (!componentSetInfo) return;

    const configArray: PropertyConfig[] = Object.entries(componentSetInfo)
      .filter(([_, propDef]) => propDef.type !== "INSTANCE_SWAP") // INSTANCE_SWAP 제외
      .map(([propertyName, propDef]) => {
        // 저장된 설정이 있으면 사용
        const savedProp = savedConfig?.find((p) => p.name === propertyName);

        if (savedProp) {
          return {
            ...savedProp,
            // variantOptions는 최신 정보로 업데이트
            variantOptions:
              propDef.type === "VARIANT" ? propDef.variantOptions : undefined,
          };
        }

        // 저장된 설정이 없으면 기본값 사용
        return {
          name: propertyName,
          type: propDef.type as "BOOLEAN" | "TEXT" | "VARIANT",
          required: false,
          is_prop: false,
          initValue: propDef.defaultValue ?? null,
          variantOptions:
            propDef.type === "VARIANT" ? propDef.variantOptions : undefined,
        };
      });

    setProperties(configArray);
  }, [componentSetInfo, savedConfig]);

  // required 업데이트 핸들러
  const updateRequired = (propertyName: string, value: boolean) => {
    setProperties((prev) =>
      prev.map((prop) => {
        if (prop.name === propertyName) {
          // required가 true면 is_prop도 true로 강제
          return {
            ...prop,
            required: value,
            is_prop: value ? true : prop.is_prop,
          };
        }
        return prop;
      })
    );
  };

  // is_prop 업데이트 핸들러
  const updateIsProp = (propertyName: string, value: boolean) => {
    setProperties((prev) =>
      prev.map((prop) =>
        prop.name === propertyName ? { ...prop, is_prop: value } : prop
      )
    );
  };

  // initValue 업데이트 핸들러
  const updateInitValue = (
    propertyName: string,
    value: string | boolean | null
  ) => {
    setProperties((prev) =>
      prev.map((prop) =>
        prop.name === propertyName ? { ...prop, initValue: value } : prop
      )
    );
  };

  // 개별 프로퍼티 validation
  const validateProperty = (prop: PropertyConfig): boolean => {
    // required가 true이고 is_prop이 true면 initValue 불필요
    if (prop.required && prop.is_prop) {
      return true;
    }

    // required가 false이고 is_prop이 true면 initValue 필수
    if (!prop.required && prop.is_prop) {
      return prop.initValue !== null && prop.initValue !== "";
    }

    // is_prop이 false면 무조건 initValue 필수
    if (!prop.is_prop) {
      return prop.initValue !== null && prop.initValue !== "";
    }

    return true;
  };

  // 전체 폼 validation
  const isFormValid = properties.every((prop) => validateProperty(prop));

  // 저장 핸들러
  const handleSave = () => {
    if (!isFormValid) return;

    parent.postMessage(
      {
        pluginMessage: {
          type: "save-component-property",
          data: properties,
        },
      },
      "*"
    );
  };

  return (
    <div className="mb-4 p-4 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-4">Component Properties</h2>

      {properties.length === 0 ? (
        <div className="text-gray-400 text-center py-4">
          설정할 프로퍼티가 없습니다
        </div>
      ) : (
        <div className="space-y-4">
          {properties.map((prop) => {
            const isValid = validateProperty(prop);
            const showInitValue =
              !prop.is_prop || (prop.is_prop && !prop.required);

            return (
              <div key={prop.name} className="border rounded p-3 space-y-2">
                {/* 이름과 타입 */}
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{prop.name}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      ({prop.type})
                    </span>
                  </div>
                </div>

                {/* Required Switch */}
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-700">Required</label>
                  <button
                    onClick={() => updateRequired(prop.name, !prop.required)}
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

                {/* Is Prop Switch */}
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-700">Is Prop</label>
                  <button
                    onClick={() => updateIsProp(prop.name, !prop.is_prop)}
                    disabled={prop.required}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      prop.is_prop ? "bg-blue-600" : "bg-gray-200"
                    } ${prop.required ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        prop.is_prop ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Init Value */}
                {showInitValue && (
                  <div className="space-y-1">
                    <label className="text-sm text-gray-700">Init Value</label>
                    {prop.type === "BOOLEAN" ? (
                      <button
                        onClick={() =>
                          updateInitValue(prop.name, !prop.initValue)
                        }
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          prop.initValue ? "bg-blue-600" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            prop.initValue ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    ) : prop.type === "VARIANT" ? (
                      <select
                        value={(prop.initValue as string) || ""}
                        onChange={(e) =>
                          updateInitValue(prop.name, e.target.value)
                        }
                        className={`w-full px-3 py-2 border rounded ${
                          !isValid ? "border-red-500" : "border-gray-300"
                        }`}
                      >
                        <option value="">선택하세요</option>
                        {prop.variantOptions?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={(prop.initValue as string) || ""}
                        onChange={(e) =>
                          updateInitValue(prop.name, e.target.value)
                        }
                        className={`w-full px-3 py-2 border rounded ${
                          !isValid ? "border-red-500" : "border-gray-300"
                        }`}
                        placeholder="초기값 입력"
                      />
                    )}
                    {!isValid && (
                      <p className="text-red-500 text-xs mt-1">
                        초기값은 필수입니다
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Save Button */}
      {properties.length > 0 && (
        <button
          onClick={handleSave}
          disabled={!isFormValid}
          className={`mt-4 w-full py-2 rounded-lg font-medium transition-colors ${
            isFormValid
              ? "bg-green-500 hover:bg-green-600 text-white"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          저장
        </button>
      )}
    </div>
  );
}

export default ComponentProperty;
