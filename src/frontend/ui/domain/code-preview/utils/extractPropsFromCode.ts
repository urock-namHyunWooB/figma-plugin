/**
 * 코드에서 Props 인터페이스를 추출하고 기본값을 설정하는 유틸리티
 */
export function extractPropsFromCode(code: string): Record<string, any> {
  const props: Record<string, any> = {};

  // interface에서 prop 정의 추출
  const interfaceMatch = code.match(/interface\s+\w+Props\s*{([^}]+)}/);
  if (!interfaceMatch) return props;

  const propsContent = interfaceMatch[1];
  const propLines = propsContent
    .split("\n")
    .filter((line) => line.includes(":"));

  propLines.forEach((line) => {
    const match = line.match(/(\w+)\??\s*:\s*(.+?);/);
    if (match) {
      const [, name, type] = match;

      // 기본값 설정
      if (type.includes("string") || type.includes('"')) {
        props[name] = "";
      } else if (type.includes("number")) {
        props[name] = 0;
      } else if (type.includes("boolean")) {
        props[name] = false;
      } else if (type.includes("ReactNode") || type.includes("component")) {
        props[name] = null;
      }
    }
  });

  return props;
}
