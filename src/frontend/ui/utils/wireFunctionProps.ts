import type { PropDefinition } from "../domain/code-generator2/types/public";

/**
 * functionSignature에서 첫 번째 파라미터 이름 추출
 * "(checked: boolean) => void" → "checked"
 * "(value: string) => void" → "value"
 */
function parseParamName(signature: string): string | null {
  const match = signature.match(/\((\w+)/);
  return match ? match[1] : null;
}

/**
 * function prop에 대해 대응 prop을 찾아 auto-wiring stub 생성
 *
 * functionSignature에서 paramName을 추출하고, props에서 동일 이름의 prop을 찾아
 * 호출 시 해당 prop의 state를 업데이트하는 stub 함수를 initialValues에 주입한다.
 *
 * 예: onChange: (checked: boolean) => void
 *   → paramName "checked" → props에서 "checked" prop 찾기
 *   → stub: (v) => setPropValues(prev => ({ ...prev, checked: v }))
 */
export function wireFunctionProps(
  initialValues: Record<string, any>,
  props: PropDefinition[],
  setPropValues: React.Dispatch<React.SetStateAction<Record<string, any>>>
): void {
  for (const prop of props) {
    if (prop.type !== "function" || !prop.functionSignature) continue;

    const paramName = parseParamName(prop.functionSignature);
    if (!paramName) continue;

    // 1. 정확 매칭 (checked → checked)
    // 2. 부분 매칭 (value → selectedValue)
    const target =
      props.find((p) => p.name === paramName) ??
      props.find(
        (p) =>
          p.type !== "function" &&
          p.name.toLowerCase().includes(paramName.toLowerCase())
      );

    if (target) {
      const targetName = target.name;
      initialValues[prop.name] = (value: any) => {
        setPropValues((prev) => ({ ...prev, [targetName]: value }));
      };
    }
  }
}
