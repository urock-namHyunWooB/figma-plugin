# Tailwind 유틸리티 매핑 보완

## 배경

현재 `tailwindUtils.ts`의 CSS_TO_TAILWIND 매핑 테이블에 빠진 항목이 있어서,
`font-weight: 600` → `[font-weight:600]` (arbitrary value)로 생성됨.
`font-semibold` 같은 표준 Tailwind 유틸리티를 써야 함.

## 변경 파일

`src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/tailwindUtils.ts` — 1개만

## 추가할 CSS_TO_TAILWIND 항목

### visibility
```ts
visibility: {
  hidden: "invisible",
  visible: "visible",
},
```

### fontWeight
```ts
fontWeight: {
  "100": "font-thin",
  "200": "font-extralight",
  "300": "font-light",
  "400": "font-normal",
  "500": "font-medium",
  "600": "font-semibold",
  "700": "font-bold",
  "800": "font-extrabold",
  "900": "font-black",
},
```

### textDecoration
```ts
textDecoration: {
  underline: "underline",
  "line-through": "line-through",
  none: "no-underline",
},
```

### textTransform
```ts
textTransform: {
  uppercase: "uppercase",
  lowercase: "lowercase",
  capitalize: "capitalize",
  none: "normal-case",
},
```

### alignSelf
```ts
alignSelf: {
  auto: "self-auto",
  "flex-start": "self-start",
  "flex-end": "self-end",
  center: "self-center",
  stretch: "self-stretch",
  baseline: "self-baseline",
},
```

### cursor
```ts
cursor: {
  pointer: "cursor-pointer",
  default: "cursor-default",
  "not-allowed": "cursor-not-allowed",
  wait: "cursor-wait",
},
```

## 삭제

`cssPropertyToTailwind()` 내 fontWeight special case (line 235-237) 삭제.
exact mapping으로 이동하므로 arbitrary value fallback 불필요.

```ts
// 삭제 대상
if (camelProperty === "fontWeight") {
  return `[font-weight:${escapeArbitraryValue(valueStr)}]`;
}
```

## Scope 외

- padding/margin shorthand 분리 (`padding: 12px 28px` → `px-7 py-3`)
- flex shorthand 파싱 (`flex: 1 0 0` → `flex-1`)
- spacing scale 매핑 (`12px` → Tailwind scale)
- TailwindStrategy.ts, ShadcnStrategy.ts 변경 없음

## 테스트

- 기존 테스트 전체 실행으로 regression 확인
- Buttonsolid, Btnsbtn fixture의 Tailwind 출력 검증
- fontWeight, visibility 등 새 매핑이 적용되는지 확인
