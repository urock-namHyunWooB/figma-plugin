import { PropIR } from "../../types";

export class PropsCleaner {
  public clean(props: PropIR[]): PropIR[] {
    return props.filter((prop) => {
      // props에서 variant이고 variantsOptions에서 true, false 혹은 'True','False' 라면 해당 객체를 없앤다.

      // if (!this.cleanVariant(prop)) {
      //   return false;
      // }

      // props에서 id에 특수문자가 들어가 있으면 처리
      let processedName = prop.normalizedName;

      // -는 camelCase로 변환 (예: state-test → stateTest)
      if (processedName.includes("-")) {
        processedName = processedName.replace(/-([a-z])/g, (_, char) =>
          char.toUpperCase()
        );
        prop.normalizedName = processedName;
      }

      // #, @는 해당 문자 이후를 모두 제거하고 type을 any로 변경
      const specialCharMatch = processedName.match(/[#@]/);
      if (specialCharMatch && specialCharMatch.index !== undefined) {
        const cleanedName = processedName.substring(0, specialCharMatch.index);
        prop.normalizedName = cleanedName;
        prop.type = "ANY";
      }

      return true; // 유지
    });
  }

  private cleanVariant(prop: PropIR): boolean {
    if (prop.type === "VARIANT" && prop.variantOptions) {
      const options = prop.variantOptions;
      const isBooleanVariant =
        (options.length === 2 &&
          ((options.includes("true") && options.includes("false")) ||
            (options.includes("True") && options.includes("False")))) ||
        (options.length === 1 &&
          (options.includes("true") ||
            options.includes("false") ||
            options.includes("True") ||
            options.includes("False")));

      if (isBooleanVariant) {
        return false; // 제거
      }
    }
    return true;
  }
}
