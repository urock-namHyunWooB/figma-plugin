import taptabpButton from "../../../../../../test/fixtures/button/taptapButton.json";
import airtableButton from "../../../../../../test/fixtures/button/airtable-button.json";

import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import { transpile } from "./transpiler";

/**
 * 테스트용 main 함수
 *
 * @deprecated 프로덕션 코드에서는 transpile() 함수를 직접 사용하세요
 */
export function main() {
  const componentSpec = taptabpButton as ComponentSetNodeSpec;
  const tsxCode = transpile(componentSpec);
}
