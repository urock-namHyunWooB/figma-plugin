# Figma Plugin - React + TypeScript + TailwindCSS

메타데이터 설정과 레이어 정보 표시 기능을 가진 Figma 플러그인입니다.

## 🚀 기술 스택

- **React 19** - UI 프레임워크
- **TypeScript** - 타입 안정성
- **TailwindCSS v4** - 유틸리티 CSS 프레임워크
- **Vite 7** - 빌드 도구
- **Figma Plugin API** - 플러그인 코어

## 📁 프로젝트 구조

```
________/
├── src/
│   ├── plugin/
│   │   └── code.ts              # Figma 플러그인 메인 코드
│   └── ui/
│       ├── components/
│       │   ├── MetadataSection.tsx  # 메타데이터 설정 컴포넌트
│       │   └── LayerInfo.tsx        # 레이어 정보 표시 컴포넌트
│       ├── App.tsx               # 메인 React 앱
│       ├── main.tsx              # React 엔트리 포인트
│       ├── index.css             # TailwindCSS 스타일
│       └── index.html            # HTML 템플릿
├── dist/                         # 빌드 결과물 폴더
│   ├── code.js                   # 빌드된 플러그인 코드 (9.7KB)
│   └── index.html                # 빌드된 UI (211KB)
├── manifest.json                 # Figma 플러그인 매니페스트
├── vite.config.ts                # Vite 설정
├── tailwind.config.js            # TailwindCSS 설정
├── postcss.config.js             # PostCSS 설정
├── tsconfig.json                 # TypeScript 설정 (플러그인)
└── tsconfig.ui.json              # TypeScript 설정 (UI)
```

## 🛠️ 개발

### 설치

```bash
npm install
```

### 빌드

```bash
npm run build          # 전체 빌드 (플러그인 + UI)
npm run build:plugin   # 플러그인만 빌드 → dist/code.js
npm run build:ui       # UI만 빌드 → dist/index.html
```

### 개발 모드

```bash
npm run dev            # 개발 모드로 빌드
```

## ✨ 주요 기능

### 1. 메타데이터 설정

- 레이어에 메타데이터 타입 설정 가능
- 옵션: Slot, Default
- `setPluginData`를 사용하여 영구 저장

### 2. 레이어 정보 표시

- 선택된 레이어의 상세 정보 실시간 표시
- 지원 정보:
  - 기본 정보 (타입, ID, 이름)
  - 위치와 크기
  - 색상 (Fill, Stroke)
  - 텍스트 속성
  - Auto Layout 설정
  - Component Variant

### 3. Variant 변경

- Component Instance의 Variant를 UI에서 직접 변경 가능
- 드롭다운으로 사용 가능한 옵션 표시

## 📦 빌드 결과물

모든 빌드 파일은 `dist/` 폴더에 생성됩니다:

- `dist/code.js` - Figma 플러그인 코드 (~10KB)
- `dist/index.html` - 단일 HTML 파일로 번들된 React UI (~211KB, gzip: 66KB)

## 🎯 Figma에서 실행

1. Figma Desktop 앱 열기
2. Plugins → Development → Import plugin from manifest
3. 이 프로젝트의 `manifest.json` 선택
4. 플러그인 실행

## 🔧 커스터마이징

### TailwindCSS 테마 수정

`tailwind.config.js`에서 테마를 커스터마이징할 수 있습니다.

### UI 컴포넌트 추가

`src/ui/components/` 폴더에 새로운 React 컴포넌트를 추가하세요.

### 플러그인 기능 추가

`src/plugin/code.ts`에서 Figma Plugin API를 사용하여 기능을 추가하세요.

## 📝 라이선스

MIT
