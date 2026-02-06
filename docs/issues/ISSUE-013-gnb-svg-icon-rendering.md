# ISSUE-013: Gnb.json SVG 아이콘 렌더링 이슈

## 상태
**RESOLVED**

## 문제 설명

`Gnb.json`의 My Info 아이콘이 원본(회색 스마일 얼굴)과 다르게 렌더링됨. 원 테두리만 보이고 내부 fill 색상이 적용되지 않음.

## 원인 분석

**1단계: fill → color 변환 누락**

SVG 내부의 `fill="currentColor"`는 부모의 CSS `color` 속성을 상속받아야 함. 하지만 `updateVectorStyles`에서 `fill`을 `color`로 변환하지 않아 색상이 미적용됨.

**2단계: styleTree 노드 타입 없음**

`styleTree`의 노드는 `type`이 `undefined`일 수 있음. `vectorTypes.includes(node.type)` 조건이 `false`가 되어 처리 스킵됨.

**해결**: `nodeSpec`에서 원본 타입 조회

```typescript
const nodeType = node.type || nodeSpec?.type;
if (!vectorTypes.includes(nodeType)) return;
```

**3단계: ELLIPSE의 background 처리**

ELLIPSE 노드(원형)는 `fill` 대신 `background`로 스타일 제공됨. `vectorSvg`가 있으면 `background`도 `color`로 변환 필요.

```typescript
if (hasVectorSvg && "background" in base && !("color" in base)) {
  base["color"] = base["background"];
  delete base["background"];
}
```

## 해결

**핵심 로직 (`_TempAstTree.updateVectorStyles`)**

| 조건                            | 변환                   | 이유                           |
| ------------------------------- | ---------------------- | ------------------------------ |
| `fill` + `vectorSvg` 있음       | `fill` → `color`       | SVG path가 `currentColor` 사용 |
| `fill` + `vectorSvg` 없음       | `fill` → `background`  | div로 렌더링, 배경색 적용      |
| `background` + `vectorSvg` 있음 | `background` → `color` | ELLIPSE 등 특수 케이스         |

## 결과

- SVG 아이콘의 `fill="currentColor"`가 부모의 `color` CSS 속성을 정상적으로 상속
- ELLIPSE 노드도 `background` → `color` 변환으로 정상 렌더링
- My Info 아이콘이 원본과 동일하게 회색 스마일 얼굴로 표시됨

## 테스트

`test/fixtures/failing/Gnb.json`
