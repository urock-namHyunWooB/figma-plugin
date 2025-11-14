/**
 * Variant 조합 생성 유틸리티
 */

export interface PropDefinition {
  name: string;
  type: string;
  defaultValue?: any;
  variantOptions?: string[];
  readonly?: boolean;
}

export interface VariantCombination {
  label: string;
  props: Record<string, any>;
}

/**
 * Props 정의에서 variant props만 추출
 */
export function extractVariantProps(
  propsDefinition: PropDefinition[],
): PropDefinition[] {
  return propsDefinition.filter(
    (prop) => prop.variantOptions && prop.variantOptions.length > 0,
  );
}

/**
 * 대표적인 variant 조합들을 생성
 * 모든 조합을 만들면 너무 많으므로, 각 variant의 모든 옵션을 개별적으로 보여주는 방식
 */
export function generateRepresentativeCombinations(
  propsDefinition: PropDefinition[],
): VariantCombination[] {
  const combinations: VariantCombination[] = [];
  const variantProps = extractVariantProps(propsDefinition);

  if (variantProps.length === 0) {
    // variant가 없으면 기본 조합만 반환
    return [
      {
        label: "Default",
        props: getDefaultProps(propsDefinition),
      },
    ];
  }

  // 기본 props 생성 (모든 prop의 기본값)
  const baseProps = getDefaultProps(propsDefinition);

  // 1. 기본 조합 추가
  combinations.push({
    label: "Default",
    props: { ...baseProps },
  });

  // 2. 각 variant prop의 모든 옵션을 개별적으로 추가
  variantProps.forEach((variantProp) => {
    if (!variantProp.variantOptions) return;

    variantProp.variantOptions.forEach((option) => {
      // 기본값이 아닌 경우만 추가
      if (option !== variantProp.defaultValue) {
        combinations.push({
          label: `${variantProp.name}: ${option}`,
          props: {
            ...baseProps,
            [variantProp.name]: option,
          },
        });
      }
    });
  });

  return combinations;
}

/**
 * 그리드로 보여줄 variant 조합 생성 (2가지 variant의 조합)
 * 예: size x type 조합
 */
export function generateGridCombinations(propsDefinition: PropDefinition[]): {
  rowVariant: PropDefinition;
  colVariant: PropDefinition;
  combinations: VariantCombination[][];
} | null {
  const variantProps = extractVariantProps(propsDefinition);

  if (variantProps.length < 2) {
    return null;
  }

  // 가장 옵션이 많은 2개의 variant 선택
  const sortedVariants = [...variantProps].sort(
    (a, b) => (b.variantOptions?.length || 0) - (a.variantOptions?.length || 0),
  );

  const rowVariant = sortedVariants[0];
  const colVariant = sortedVariants[1];

  const baseProps = getDefaultProps(propsDefinition);

  // 2차원 배열로 조합 생성
  const combinations: VariantCombination[][] = [];

  rowVariant.variantOptions?.forEach((rowOption) => {
    const row: VariantCombination[] = [];

    colVariant.variantOptions?.forEach((colOption) => {
      row.push({
        label: `${rowVariant.name}=${rowOption}, ${colVariant.name}=${colOption}`,
        props: {
          ...baseProps,
          [rowVariant.name]: rowOption,
          [colVariant.name]: colOption,
        },
      });
    });

    combinations.push(row);
  });

  return {
    rowVariant,
    colVariant,
    combinations,
  };
}

/**
 * 모든 props의 기본값 추출
 */
function getDefaultProps(
  propsDefinition: PropDefinition[],
): Record<string, any> {
  const props: Record<string, any> = {};

  propsDefinition.forEach((prop) => {
    if (prop.defaultValue !== undefined && prop.defaultValue !== "") {
      props[prop.name] = prop.defaultValue;
    } else {
      // 기본값이 없으면 타입에 따라 설정
      if (prop.type === "boolean") {
        props[prop.name] = false;
      } else if (prop.type === "number") {
        props[prop.name] = 0;
      } else if (prop.type === "string") {
        // variantOptions가 있으면 첫 번째 옵션 사용
        if (prop.variantOptions && prop.variantOptions.length > 0) {
          props[prop.name] = prop.variantOptions[0];
        } else {
          props[prop.name] = "";
        }
      }
    }
  });

  return props;
}

/**
 * 모든 가능한 조합 생성 (주의: 조합이 너무 많아질 수 있음)
 */
export function generateAllCombinations(
  propsDefinition: PropDefinition[],
  maxCombinations: number = 50,
): VariantCombination[] {
  const variantProps = extractVariantProps(propsDefinition);

  if (variantProps.length === 0) {
    return [
      {
        label: "Default",
        props: getDefaultProps(propsDefinition),
      },
    ];
  }

  const baseProps = getDefaultProps(propsDefinition);
  const combinations: VariantCombination[] = [];

  // 재귀적으로 모든 조합 생성
  function generateRecursive(
    index: number,
    currentProps: Record<string, any>,
    currentLabel: string[],
  ) {
    if (combinations.length >= maxCombinations) {
      return;
    }

    if (index === variantProps.length) {
      combinations.push({
        label: currentLabel.join(", "),
        props: { ...currentProps },
      });
      return;
    }

    const variantProp = variantProps[index];
    const options = variantProp.variantOptions || [];

    options.forEach((option) => {
      generateRecursive(
        index + 1,
        {
          ...currentProps,
          [variantProp.name]: option,
        },
        [...currentLabel, `${variantProp.name}=${option}`],
      );
    });
  }

  generateRecursive(0, baseProps, []);

  return combinations;
}
