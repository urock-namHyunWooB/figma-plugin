# Emotion Compound Variants 배열 패턴 전환

## 배경

현재 Emotion 생성 코드에서 compound 스타일 키가 `"Large+true"` 같은 문자열 concat 방식.
업계 표준(MUI variants, CVA compoundVariants, Chakra cva)은 전부 **배열 + props 매칭** 패턴.
Tailwind/Shadcn 쪽은 이미 compoundVariants 형태로 생성되고 있으므로 **Emotion만 변경 대상**.

## 변경 전/후

### EmotionStrategy 출력

```ts
// Before
const root_sizeIconOnlyStyles: Record<string, SerializedStyles> = {
  "Large+true": css`height: 48px; padding: 0 24px;`,
  "Large+false": css`height: 56px; padding: 0 32px;`,
  "Small+true": css`height: 32px; padding: 0 12px;`,
};

// After
const root_sizeIconOnlyStyles = [
  { size: "Large", iconOnly: true, css: css`height: 48px; padding: 0 24px;` },
  { size: "Large", iconOnly: false, css: css`height: 56px; padding: 0 32px;` },
  { size: "Small", iconOnly: true, css: css`height: 32px; padding: 0 12px;` },
];
```

### NodeRenderer 출력

```ts
// Before
root_sizeIconOnlyStyles?.[`${size}+${iconOnly ? "true" : "false"}`]

// After
root_sizeIconOnlyStyles.find(v => v.size === size && v.iconOnly === iconOnly)?.css
```

## 값 타입 규칙

- **boolean prop**: `iconOnly: true` / `iconOnly: false` (boolean 리터럴)
- **string prop**: `size: "Large"` (문자열 리터럴)
- 현재의 `"true"/"false"` 문자열 변환이 불필요해짐

## 수정 파일

### 변경

1. **EmotionStrategy.ts** — `generateDynamicCode()` 내 compound prop 분기
   - `Record<string, SerializedStyles>` 객체 리터럴 → 배열 리터럴 생성
   - 각 entry: `{ propName1: value1, propName2: value2, css: css`...` }`
   - single prop은 현재 Record 방식 그대로 유지

2. **NodeRenderer.ts** — `buildDynamicStyleRef()` 내 compound 분기
   - 문자열 concat lookup → `.find(v => v.prop === val && ...)?.css`
   - boolean prop은 boolean 비교, string prop은 문자열 비교

### 변경하지 않는 것

- **DynamicStyleDecomposer** — 내부 IR 키 포맷(`"size+iconOnly"`) 유지
- **UITreeOptimizer** — IR 소비자, 변경 불필요
- **TailwindStrategy / ShadcnStrategy** — 이미 compoundVariants 형태
- **NodeRenderer의 기타 메서드** — `extractDynamicProps`, `flatMap(prop.split("+"))` 등 IR 기반 파싱은 그대로

## 테스트

- buttonsolid, button.json 등 compound decompose가 포함된 fixture로 생성 코드 검증
- 기존 스냅샷 업데이트 필요 (compound 키 형태 변경)
- 스냅샷 diff에서 배열 패턴 + find 매칭이 올바르게 나오는지 확인
