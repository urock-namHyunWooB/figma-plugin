# NP layoutPositioning gap 수정 설계

**작성일**: 2026-04-10
**상태**: 구현 진행
**대상**: `src/.../variant-merger/match-engine/signals/NormalizedPosition.ts`

---

## 1. 문제

NormalizedPosition이 `layoutPositioning`이 다른 두 노드(auto-layout 플로우 vs ABSOLUTE 오버레이)의 위치를 비교하고 있음. 배치 방식이 다르면 위치 비교가 무의미한데 cost 0을 반환 → Hungarian이 동전 던지기로 잘못 배정.

실측 (Buttonsolid): Wrapper(플로우, 42×24)와 Interaction(ABSOLUTE, 98×48)이 중심점 동일 → cost 0 → swap 발생.

## 2. 수정

NP의 `evaluate()` 시작 부분에 layoutPositioning 비교 추가:
- 두 노드의 원본 Figma 노드에서 `layoutPositioning` 속성 확인
- 하나가 `"ABSOLUTE"`이고 다른 하나가 아니면 → `neutral` 반환 (비교 자체를 하지 않음)

## 3. 검증

- 페어 단언: FAIL 2건(Wrapper↔Interaction swap) → PASS로 변경
- 페어 단언: PASS 3건 유지
- observer before/after diff
- 기존 테스트 baseline 유지
