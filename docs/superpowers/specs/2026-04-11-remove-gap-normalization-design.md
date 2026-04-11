# Remove gap normalization from StyleProcessor

## Problem

`StyleProcessor.normalizeAcrossVariants()`가 자식 ≤1인 variant의 gap을 암묵적으로 삭제하여:
1. **Buttonsolid**: 모든 의미 있는 gap이 사라져 생성 코드에서 아이콘-라벨 간격 누락
2. **디자이너 피드백 차단**: 디자인 실수(Icon=False variant의 무의미한 gap 값 불일치)가 diagnostics에 노출되지 않음

## Root Cause

Figma 디자이너가 자식 1개인 variant(Icon=False)에 렌더링에 무의미한 gap 값을 다르게 설정해둠 (예: Icon=True → 6.5px, Icon=False → 10px). 이는 디자인 실수이며, 코드가 보정할 문제가 아님.

## Decision

**접근법 A 채택**: gap 삭제 로직 완전 제거. FD 분해가 데이터를 있는 그대로 처리하도록 하고, compound 조건이 생기면 그게 현재 디자인의 정직한 반영.

## Changes

1. **`StyleProcessor.normalizeAcrossVariants()` 제거**
   - 메서드 전체 삭제 (line 674-724)
   - 호출부 삭제 (line 540)
   - 관련 주석 삭제 (line 539, 543)

2. **Button test 기대값 수정**
   - `test/compiler/test-button-tw.test.ts`: "gap은 size 단독" → gap이 compound가 되는 것을 허용하거나, 디자인 데이터 반영으로 기대값 변경

3. **Buttonsolid gap diagnostic test 정리**
   - `test/compiler/test-buttonsolid-gap.test.ts`: diagnostic throw 테스트 → 실제 gap 존재 검증 테스트로 교체 또는 제거

## Not In Scope

- FD diagnostics 시스템 변경 (이미 compound 불일치 감지 가능)
- 새로운 diagnostic 타입 추가
