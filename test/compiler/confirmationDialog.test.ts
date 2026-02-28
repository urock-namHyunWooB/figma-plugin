import { describe, it, expect } from 'vitest';
import FigmaCodeGenerator from '@code-generator2';
import { readFileSync } from 'fs';

describe('ConfirmationDialog 버튼 텍스트 오버라이드', () => {
  it('Cancel/Confirm 버튼 텍스트가 올바르게 오버라이드되어야 함', async () => {
    const data = JSON.parse(readFileSync('./test/fixtures/any/ConfirmationDialog.json', 'utf-8'));
    const compiler = new FigmaCodeGenerator(data, { debug: false });
    const code = await compiler.compile();
    
    console.log('\n=== 생성된 코드 ===\n');
    console.log(code);
    
    // 기본 검증
    expect(code).toBeDefined();
    expect(code).toContain('Button');
    
    // Cancel 텍스트 검증
    const hasCancel = code?.includes('Cancel');
    console.log('\nCancel 텍스트 포함 여부:', hasCancel);
    
    // Confirm 텍스트 검증
    const hasConfirm = code?.includes('Confirm');
    console.log('Confirm 텍스트 포함 여부:', hasConfirm);
    
    // 결과 출력
    if (hasCancel) {
      console.log('\n[PASS] "Cancel" 텍스트가 코드에 포함됨');
    } else {
      console.log('\n[FAIL] "Cancel" 텍스트가 코드에 없음');
    }
    if (hasConfirm) {
      console.log('[PASS] "Confirm" 텍스트가 코드에 포함됨');
    } else {
      console.log('[FAIL] "Confirm" 텍스트가 코드에 없음');
    }
    
    // 실제 검증
    expect(hasCancel).toBe(true);
    expect(hasConfirm).toBe(true);
  });
});
