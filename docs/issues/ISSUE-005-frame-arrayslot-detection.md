# ISSUE-005: FRAME에서 ArraySlot 감지

## 상태
**RESOLVED**

## 문제 설명

FRAME 내부의 동일 컴포넌트 INSTANCE들이 ArraySlot으로 감지되어 `.map()` 형태로 렌더링됨. 사용자는 정적 렌더링을 원함.

## 해결

`ArraySlotDetector.detect()`에서 COMPONENT_SET/COMPONENT만 ArraySlot 감지:

```typescript
if (document.type !== "COMPONENT_SET" && document.type !== "COMPONENT") {
  return []; // FRAME, SECTION 등은 정적 렌더링
}
```

## 테스트

`test/compiler/arraySlot.test.ts`
