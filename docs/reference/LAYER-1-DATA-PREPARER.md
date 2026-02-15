# Layer 1: DataPreparer

> "나중에 빨리 찾을 수 있게 미리 정리해둔다"

Figma 원본 데이터를 효율적으로 조회할 수 있는 형태로 변환합니다.

---

## 문제 상황

Figma에서 받은 데이터는 이렇게 생겼다:

```
Document
├── Frame "Button"
│   ├── Frame "Container"
│   │   ├── Text "Label" (id: 123:456)
│   │   └── Instance "Icon" (id: 789:012)
│   └── ...
└── ...
```

나중에 코드에서 이런 질문을 한다:
- "ID `123:456` 노드의 폰트 사이즈 뭐야?"
- "ID `789:012` 노드의 스타일 정보 줘"

**문제**: 매번 트리 전체를 순회해야 한다. 노드가 1000개면 1000번 탐색.

---

## 해결 방법

**미리 HashMap(색인)을 만들어둔다.**

```
nodeMap = {
  "123:456": { type: "TEXT", characters: "Label", fontSize: 14, ... },
  "789:012": { type: "INSTANCE", componentId: "xxx", ... },
  ...
}

styleMap = {
  "123:456": { color: "#000", fontWeight: 600, ... },
  "789:012": { width: 24, height: 24, ... },
  ...
}
```

이제 질문에 바로 답할 수 있다:
```
nodeMap.get("123:456")  // O(1) - 즉시 반환
```

---

## 하는 일

| 작업 | 설명 |
|------|------|
| **깊은 복사** | 원본 데이터 변질 방지 (원본은 건드리지 않음) |
| **nodeMap 구축** | 노드 ID → 노드 데이터 (O(1) 조회) |
| **styleMap 구축** | 노드 ID → 스타일 데이터 (O(1) 조회) |
| **prop 이름 정규화** | `Show Icon#123:456` → `showIcon` (camelCase) |

---

## 비유

**도서관 색인 카드**

책(노드)을 찾을 때:
- 모든 책장을 다 뒤진다 → 느림
- 색인 카드를 본다 → 빠름

DataPreparer는 **색인 카드를 미리 만들어두는 작업**이다.

---

## 입력 vs 출력

**입력 (FigmaNodeData)**:
- Figma API에서 받은 원본 트리 구조
- 특정 노드 찾으려면 순회 필요

**출력 (PreparedDesignData)**:
- `nodeMap`: ID로 노드 즉시 조회
- `styleMap`: ID로 스타일 즉시 조회
- `props`: 정규화된 prop 정의

---

## 핵심

> "나중에 빨리 찾을 수 있게 미리 정리해둔다"

TreeBuilder와 CodeEmitter가 수시로 "이 노드 정보 줘"라고 요청한다. 그때마다 트리를 순회하면 느리니까, **미리 HashMap으로 정리**해둔다.

---

## 요약

| 항목 | 내용 |
|------|------|
| 목적 | 데이터 조회 최적화 |
| 핵심 작업 | HashMap 구축 (nodeMap, styleMap) |
| 성능 | O(n) 순회 → O(1) 조회 |
| 부가 작업 | 깊은 복사, prop 이름 정규화 |
