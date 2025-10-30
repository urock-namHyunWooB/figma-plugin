// Function 파라미터 인터페이스
export interface FunctionParameter {
  id: string;
  name: string;
  type: string;
}

// Props 정의 인터페이스
export interface PropDefinition {
  id: string;
  name: string;
  type:
    | "string"
    | "number"
    | "boolean"
    | "object"
    | "array"
    | "component"
    | "function";
  defaultValue?: any;
  required: boolean;
  description?: string;
  // function 타입일 때만 사용
  parameters?: FunctionParameter[];
  returnType?: string;
}

/**
 * 유효한 JavaScript 변수명인지 검사
 */
export const isValidVariableName = (name: string): boolean => {
  if (!name) return false;
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
};

/**
 * 중복된 이름이 있는지 검사
 */
export const hasDuplicateNames = (props: PropDefinition[]): boolean => {
  const names = props.map((p) => p.name).filter((n) => n);
  return names.length !== new Set(names).size;
};

/**
 * 유효한 JSON 문자열인지 검사
 */
export const isValidJSON = (value: string): boolean => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * 개별 prop의 유효성 검사
 */
export const validateProp = (prop: PropDefinition): boolean => {
  // Name validation
  if (!isValidVariableName(prop.name)) {
    return false;
  }

  // JSON validation for object/array types
  if (
    (prop.type === "object" || prop.type === "array") &&
    prop.defaultValue &&
    typeof prop.defaultValue === "string"
  ) {
    return isValidJSON(prop.defaultValue);
  }

  return true;
};

/**
 * 전체 폼의 유효성 검사
 */
export const isFormValid = (props: PropDefinition[]): boolean => {
  if (props.length === 0) return false;
  if (hasDuplicateNames(props)) return false;
  return props.every((prop) => validateProp(prop));
};

/**
 * prop 이름의 에러 메시지 반환
 */
export const getNameError = (
  prop: PropDefinition,
  allProps: PropDefinition[]
): string | null => {
  if (!prop.name) return "이름을 입력하세요";
  if (!isValidVariableName(prop.name))
    return "유효한 JavaScript 변수명이 아닙니다";
  if (
    allProps.filter((p) => p.name === prop.name && p.name !== "").length > 1
  ) {
    return "중복된 이름입니다";
  }
  return null;
};

/**
 * prop 기본값의 에러 메시지 반환
 */
export const getDefaultValueError = (prop: PropDefinition): string | null => {
  if (
    (prop.type === "object" || prop.type === "array") &&
    prop.defaultValue &&
    typeof prop.defaultValue === "string" &&
    !isValidJSON(prop.defaultValue)
  ) {
    return "유효한 JSON 형식이 아닙니다";
  }
  return null;
};

