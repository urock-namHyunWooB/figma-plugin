import { PropDefinition } from "./validation";

/**
 * prop 타입에 따른 배경색 클래스 반환
 */
export const getPropTypeBgColor = (
  type: PropDefinition["type"]
): string => {
  switch (type) {
    case "string":
      return "bg-blue-100 text-blue-700";
    case "number":
      return "bg-green-100 text-green-700";
    case "boolean":
      return "bg-purple-100 text-purple-700";
    case "object":
      return "bg-orange-100 text-orange-700";
    case "array":
      return "bg-pink-100 text-pink-700";
    case "component":
      return "bg-indigo-100 text-indigo-700";
    case "function":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

