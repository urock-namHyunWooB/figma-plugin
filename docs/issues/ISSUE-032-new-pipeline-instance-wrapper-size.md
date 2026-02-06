# ISSUE-032: 새 파이프라인 INSTANCE wrapper 크기 미적용

## 상태
**RESOLVED**

## 관련 이슈
- ISSUE-004: INSTANCE wrapper 크기 누락 (레거시 파이프라인에서 해결됨)

## 문제 설명

새 아키텍처(DataPreparer → TreeBuilder → ReactEmitter)에서 외부 컴포넌트(INSTANCE)의 wrapper에 크기 제한이 적용되지 않아 레이아웃이 깨짐.

### 재현 fixture
`test/fixtures/failing/StateinsertGuideTextfalse.json`

### 증상
- Delete 아이콘이 18x18px 대신 251.812px로 렌더링
- 전체 Input box 레이아웃 완전히 깨짐

### 예상 vs 실제

| 항목 | Figma 원본 | 실제 렌더링 |
|-----|-----------|------------|
| `_Normal Responsive` INSTANCE 크기 | 18x18px | 251.812px |
| Input box 레이아웃 | 정상 | 완전히 깨짐 |

## 원인 분석

### Figma JSON 데이터
```json
{
  "id": "153:3300",
  "name": "_Normal Responsive",
  "type": "INSTANCE",
  "absoluteBoundingBox": {
    "width": 18,
    "height": 18
  },
  "layoutSizingHorizontal": "FIXED",
  "layoutSizingVertical": "FIXED"
}
```

### 문제점
1. INSTANCE가 외부 컴포넌트로 변환될 때 wrapper div에 `width/height`가 적용되지 않음
2. 외부 컴포넌트 내부에서 `width: 100%; height: 100%;`를 사용하면 부모 공간을 모두 차지
3. ISSUE-004에서 레거시 파이프라인(`CreateJsxTree`)은 수정됨
4. 새 파이프라인(`ReactEmitter`)에는 동일한 수정이 적용되지 않음

## 해결 방안

### 접근 방법
INSTANCE 노드의 스타일을 **두 부분**으로 분리:
1. **wrapperStyles**: 외부 컴포넌트를 감싸는 wrapper div의 스타일 (크기, 위치, flex 등)
2. **node.styles**: 외부 컴포넌트에 전달되는 props (CSS 변수)

### 수정된 파일

#### 1. `types/architecture.ts`
`DesignNode` 인터페이스에 `wrapperStyles` 필드 추가:

```typescript
export interface DesignNode {
  // ...
  wrapperStyles?: Record<string, string | number>;
}
```

#### 2. `core/tree-builder/workers/NodeConverter.ts`
INSTANCE 노드의 스타일을 wrapperStyles로 분리:

```typescript
if (preparedNode.externalRef) {
  const allStyles = this.styleExtractor.extractStyles(spec);

  // 외부 컴포넌트는 스타일을 두 부분으로 분리
  // 1. wrapperStyles: wrapper div에 적용 (크기, 위치, flex 등)
  // 2. node.styles: 컴포넌트 props로 전달 (CSS 변수만)

  designNode.wrapperStyles = allStyles; // wrapper div가 모든 레이아웃 담당
  designNode.styles = {}; // 외부 컴포넌트는 CSS 변수만 전달
}
```

#### 3. `core/code-emitter/generators/ComponentGenerator.ts`
wrapper div 생성 로직 추가:

```typescript
private generateExternalComponent(node: DesignNode): string {
  // wrapperStyles가 있으면 wrapper div로 감싸기
  if (node.wrapperStyles && Object.keys(node.wrapperStyles).length > 0) {
    const wrapperCssVar = this.styleStrategy.getWrapperCssVariableName(node.id);

    return `<div css={${wrapperCssVar}}>
      <${componentName} ${propsString} />
    </div>`;
  }

  // wrapperStyles가 없으면 직접 렌더링
  return `<${componentName} ${propsString} />`;
}
```

#### 4. `IStyleStrategy.ts` + 구현체들
wrapperStyles 처리 메서드 추가:

```typescript
interface IStyleStrategy {
  getWrapperCssVariableName(nodeId: string): string;
  generateWrapperStyles(node: DesignNode): string;
}
```

- **EmotionStyleStrategy**: `AIdWrapperCss` CSS 변수 생성
- **TailwindStyleStrategy**: wrapper 클래스 생성

### 핵심 변경사항

1. INSTANCE 노드의 레이아웃 스타일(width, height, position 등)을 **wrapperStyles**로 분리
2. wrapper div가 모든 크기/위치 책임을 담당
3. 외부 컴포넌트는 props(CSS 변수)만 전달받음
4. 스타일 전략 패턴에 wrapper 처리 로직 추가

## 테스트 계획

1. `StateinsertGuideTextfalse.json` fixture로 컴파일 테스트
2. Delete 아이콘이 18x18px로 렌더링되는지 확인
3. 브라우저에서 시각적 검증

## 스크린샷

### 문제 상황
Delete 아이콘(원형 X 버튼)이 비정상적으로 크게 렌더링되어 Input box 전체 레이아웃을 차지함.

## 관련 파일

| 파일 | 역할 |
|-----|------|
| `src/frontend/ui/domain/code-generator/core/code-emitter/generators/ComponentGenerator.ts` | 외부 컴포넌트 JSX 생성 |
| `src/frontend/ui/domain/code-generator/core/code-emitter/ReactEmitter.ts` | 코드 생성 오케스트레이터 |
| `test/fixtures/failing/StateinsertGuideTextfalse.json` | 재현용 fixture |
