# Dependency Import Option Design

## 목적

코드 제너레이터가 dependency(하위 컴포넌트)를 처리할 때, 현재는 항상 같은 파일에 인라인 번들링한다. 디자인 시스템에서 컴포넌트를 개별 파일로 관리하는 경우 외부 import가 더 적절하다. 사용자가 Bundle/Import를 선택할 수 있는 옵션을 추가한다.

## 요구사항

1. UI에서 Bundle(기본) / Import 모드를 토글로 선택
2. Import 모드: dependency 코드를 생성하지 않고, import 문만 남김
3. Import 경로의 prefix를 텍스트 입력으로 지정 (기본 `@/components/`)
4. Import 모드 선택 시에만 경로 입력 UI 표시

## 접근 방식

ReactBundler 분기 방식. ReactBundler가 이미 dependency 조합의 책임을 갖고 있으므로 여기서 mode 분기를 추가한다.

## 데이터 흐름

```
App.tsx (UI)
  ├── dependencyMode: "bundle" | "import"  (기본 "bundle")
  └── importBasePath: string               (기본 "@/components/")
       ↓
FigmaCodeGenerator (옵션 전달)
       ↓
ReactEmitter.emitAll() → ReactBundler.bundle()
       ↓
ReactBundler:
  mode === "bundle" → 기존 인라인 번들 로직 (변경 없음)
  mode === "import" → dependency 코드 제거, import 문만 삽입
```

## ReactBundler 변경

### 옵션 타입

```ts
interface BundleOptions {
  dependencyMode: "bundle" | "import";
  importBasePath: string;
}
```

### Import 모드 로직

`bundle()` 메서드에 import 모드 분기 추가:

```
bundle(main, deps, options)
  if options.dependencyMode === "import":
    1. dependency 코드 인라인 스킵
    2. 각 dep의 componentName으로 import 문 생성
    3. main 코드의 기존 import 블록에 dependency import 문 병합
    4. main 코드만 반환
  else:
    기존 인라인 번들 로직 (변경 없음)
```

### Import 문 형식

named export 형태로 통일:

```ts
// importBasePath = "@/components/"
import { ButtonIcon } from '@/components/ButtonIcon'

// importBasePath = "./"
import { ButtonIcon } from './ButtonIcon'

// importBasePath = "../ui/"
import { ButtonIcon } from '../ui/ButtonIcon'
```

`importBasePath` 값을 그대로 경로 prefix로 사용하고, dependency의 `componentName`을 파일명으로 붙인다.

## UI 변경 (App.tsx)

### 레이아웃

스타일 토글(Emotion/Tailwind/Shadcn) 옆에 동일한 버튼 스타일로 Bundle/Import 토글 추가. Import 선택 시 경로 입력 표시:

```
[Emotion] [Tailwind] [Shadcn]  |  [Bundle] [Import] [   @/components/   ]
                                                      ↑ import 선택 시에만 표시
```

### 상태

```ts
const [dependencyMode, setDependencyMode] = useState<"bundle" | "import">("bundle");
const [importBasePath, setImportBasePath] = useState("@/components/");
```

### 전달 경로

`dependencyMode`와 `importBasePath`를 `FigmaCodeGenerator`를 통해 `ReactEmitter` → `ReactBundler`까지 전달.

## 변경 파일 목록

1. **ReactBundler.ts** — `bundle()` 메서드에 import 모드 분기 + import 문 생성 로직
2. **App.tsx** — Bundle/Import 토글 UI + importBasePath 입력 + 상태 관리
3. **FigmaCodeGenerator → ReactEmitter 경로** — 옵션 전달 (타입 추가 + passthrough)

## 범위 외

- dependency를 별도 파일로 생성하는 기능 (B 옵션)은 이번 스코프 밖
- 파일명 매핑 커스터마이징 불필요 (componentName = 파일명)
