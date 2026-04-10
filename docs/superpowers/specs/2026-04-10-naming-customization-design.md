# CodeEmitter 네이밍 규칙 커스터마이징

> 시리즈: CodeEmitter 사용자 커스터마이징 (2/N)
> 날짜: 2026-04-10

## 목적

사용자가 생성되는 코드의 네이밍 규칙(컴포넌트명, 충돌 prop prefix, 스타일 변수)을 커스터마이징할 수 있게 한다.

## 설계

### NamingOptions 타입

```typescript
export interface NamingOptions {
  componentPrefix?: string;        // 기본: ""
  componentSuffix?: string;        // 기본: ""
  conflictPropPrefix?: string;     // 기본: "custom"
  styleBaseSuffix?: string;        // 기본: "Css"
  styleVariantSuffix?: string;     // 기본: "Styles"
  styleNamingStrategy?: "verbose" | "compact" | "minimal";  // 기본: "verbose"
}
```

### 각 옵션 동작

**1. 컴포넌트명 prefix/suffix**

`ir.name`에 prefix/suffix를 적용한다.

| 입력 | 원본 | 결과 |
|---|---|---|
| prefix="", suffix="" | Button | Button |
| prefix="", suffix="Component" | Button | ButtonComponent |
| prefix="UI", suffix="" | Button | UIButton |

**2. 충돌 prop prefix**

native HTML attribute와 이름이 겹치는 prop에 붙는 prefix를 변경한다.
현재 `"custom"` 하드코딩 (`ReactEmitter.ts:525`).

| 입력 | 원본 prop | 결과 |
|---|---|---|
| "custom" (기본) | type | customType |
| "fig" | type | figType |
| "ds" | type | dsType |

**3. 스타일 변수 suffix**

EmotionStrategy에서 스타일 변수에 붙는 suffix를 변경한다.

- `styleBaseSuffix`: 기본 스타일 변수 suffix (기본: `Css`)
- `styleVariantSuffix`: variant별 스타일 변수 suffix (기본: `Styles`)

| 입력 | 현재 | 변경 후 |
|---|---|---|
| baseSuffix="Style", variantSuffix="Var" | `buttonCss`, `button_sizeStyles` | `buttonStyle`, `button_sizeVar` |

**4. 스타일 변수 네이밍 전략**

EmotionStrategy의 변수명 생성 알고리즘을 선택한다.

| 전략 | 로직 | 예시 |
|---|---|---|
| `verbose` (기본) | 상위 3노드 경로 기반 | `buttonWrapperMaskCss` |
| `compact` | 마지막 노드명만, 충돌 시 `_2` | `maskCss` |
| `minimal` | 인덱스 기반 | `s1`, `s2` |

### 단일 주입점 아키텍처

`NamingOptions`는 `GeneratorOptions`에 위치하며 (프레임워크 공통), `ICodeEmitter` 인터페이스를 통해 각 emitter로 전달된다.

```
GeneratorOptions.naming: NamingOptions     ← 사용자 입력 진입점
    └→ ICodeEmitter                        ← 인터페이스 레벨
        ├→ ReactEmitter
        │   ├→ EmotionStrategy (suffix, 네이밍 전략)
        │   ├→ StylesGenerator (minimal일 때 인덱스 생성)
        │   ├→ renameNativeProps (충돌 prefix)
        │   └→ emit() (컴포넌트명 prefix/suffix)
        ├→ VueEmitter (future)
        └→ SwiftEmitter (future)
```

각 emitter는 `NamingOptions`에서 자기에게 필요한 값만 꺼내 쓴다.
프레임워크 공통 옵션(componentPrefix, conflictPropPrefix)은 모든 emitter가 동일하게 적용.
프레임워크 특화 옵션(styleBaseSuffix 등)은 해당 emitter만 해석.

### 충돌 방지 (입력 시점)

- `styleBaseSuffix === styleVariantSuffix` → 차단 ("suffix가 같으면 변수명 충돌")
- `componentSuffix`가 `styleBaseSuffix`와 동일 → 경고

### 수정 대상 파일

| 파일 | 변경 |
|---|---|
| `types/public.ts` | `NamingOptions` 타입 추가, `GeneratorOptions.naming` 필드 추가 |
| `ICodeEmitter.ts` | `emit()` 등에 naming 옵션 전달 경로 확보 |
| `ReactEmitter.ts` | constructor에서 naming 수신, 하위 모듈로 분배 |
| `ReactEmitter.ts (renameNativeProps)` | `"custom"` 하드코딩 → `naming.conflictPropPrefix` |
| `ReactEmitter.ts (emit)` | `ir.name`에 prefix/suffix 적용 |
| `EmotionStrategy.ts` | suffix 옵션 수신, 네이밍 전략 분기 (verbose/compact/minimal) |
| `StylesGenerator.ts` | minimal 전략일 때 인덱스 기반 이름 생성 |
| `FigmaCodeGenerator.ts` | `options.naming` → ReactEmitter로 전달 |
| `App.tsx` | Code 탭에 네이밍 전략 드롭다운 + 텍스트 입력 UI 추가 |

### UI

Code 탭 옵션 바에:
- **네이밍 전략 드롭다운** (verbose / compact / minimal) — 기존 드롭다운과 같은 행
- **세부 설정** (prefix/suffix/conflict prefix 텍스트 입력) — 필요 시 두 번째 행 또는 팝오버

### 프리셋과의 관계

이 옵션은 향후 프리셋 시스템의 구성 요소가 된다.
예: "Shadcn 프리셋" → `{ conflictPropPrefix: "ui", styleNamingStrategy: "compact" }`

### 테스트 계획

- 컴포넌트명 prefix/suffix 조합 테스트
- 충돌 prop prefix 변경 테스트 (button의 type prop)
- 스타일 suffix 변경 테스트
- 3가지 네이밍 전략 각각의 출력 테스트
- 충돌 방지: 동일 suffix 입력 시 에러/경고 테스트
- 기존 테스트: 기본값 유지이므로 회귀 없어야 함
