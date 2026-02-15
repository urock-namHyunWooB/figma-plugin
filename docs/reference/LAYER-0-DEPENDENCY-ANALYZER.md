# Layer 0: DependencyAnalyzer

> "뭘 먼저 만들어야 하지?"

컴포넌트 간 의존성을 분석하고 컴파일 순서를 결정합니다.

---

## 문제 상황

사용자가 Figma에서 "Dialog" 컴포넌트를 선택했다.

```
Dialog (선택됨)
├── Header
├── Body
└── Button (외부 컴포넌트 참조)
     └── Icon (외부 컴포넌트 참조)
```

Dialog 코드를 생성하면:
```tsx
import { Button } from './Button';  // ← Button 코드가 있어야 함

export const Dialog = () => {
  return (
    <div>
      <Button />
    </div>
  );
};
```

**문제**: Button 코드가 아직 없는데 어떻게 import하지?

---

## 해결 방법

### 1단계: 의존성 그래프 구축

INSTANCE 노드를 찾아서 "누가 누굴 참조하는지" 파악한다.

```
Dialog ──uses──→ Button
Button ──uses──→ Icon
```

### 2단계: 순환 의존성 체크

만약 이런 상황이면?
```
A → B → C → A  (순환!)
```
컴파일 불가능. 에러를 던진다.

### 3단계: 토폴로지 정렬

"의존받는 것"부터 순서를 정한다.

```
Icon (아무것도 참조 안함) → Button (Icon 참조) → Dialog (Button 참조)
```

---

## 결과

DependencyAnalyzer가 컴파일 순서를 반환한다:

```
[Icon, Button, Dialog]
```

이 순서대로 Layer 1~3을 반복 실행하면:
1. Icon 컴파일 → Icon 코드 생성됨
2. Button 컴파일 → `import { Icon }`이 가능해짐
3. Dialog 컴파일 → `import { Button }`이 가능해짐

---

## 핵심 개념

> "재료가 준비되어야 요리할 수 있다"

Icon이 없으면 Button을 못 만들고, Button이 없으면 Dialog를 못 만든다.

DependencyAnalyzer는 **뭘 먼저 만들어야 하는지** 알려준다.

---

## 요약

| 단계 | 하는 일 |
|------|--------|
| 그래프 구축 | INSTANCE 노드에서 외부 컴포넌트 참조 탐색 |
| 순환 감지 | A → B → A 같은 순환 참조 발견 시 에러 |
| 토폴로지 정렬 | 의존받는 컴포넌트부터 순서 결정 |
