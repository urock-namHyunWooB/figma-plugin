import { describe, test, expect } from 'vitest';
import { generateReactCode, validateGeneratedCode, findInCode } from './utils/test-helpers';
import simpleButtonSpec from './fixtures/simple-button.json';

describe('React Code Generator', () => {
  describe('기본 구조 생성', () => {
    test('SimpleButton: 모든 필수 요소 포함', async () => {
      const result = await generateReactCode(simpleButtonSpec);
      const validation = validateGeneratedCode(result.code);

      expect(validation.hasInterface).toBe(true);
      expect(validation.hasFunction).toBe(true);
      expect(validation.hasStyles).toBe(true);
      expect(validation.hasReturn).toBe(true);
      expect(validation.hasExport).toBe(true);
    });

    test('코드가 비어있지 않음', async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code.length).toBeGreaterThan(0);
    });
  });

  describe('Props Interface 생성', () => {
    test('Props Interface 이름 형식', async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code).toContain('interface SimpleButtonProps');
    });

    test('Required prop은 ? 없음', async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code).toContain('text: string;');
      expect(result.code).not.toContain('text?:');
    });

    test('Optional prop 테스트', async () => {
      const spec = {
        metadata: { name: 'Test' },
        propsDefinition: [
          { name: 'onClick', type: 'function', required: false }
        ]
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('onClick?:');
    });

    test('Function type 변환', async () => {
      const spec = {
        metadata: { name: 'Test' },
        propsDefinition: [
          {
            name: 'onClick',
            type: 'function',
            required: true,
            parameters: [{ name: 'e', type: 'MouseEvent' }],
            returnType: 'void'
          }
        ]
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('(e: MouseEvent) => void');
    });

    test('React.ReactNode type 변환', async () => {
      const spec = {
        metadata: { name: 'Test' },
        propsDefinition: [
          { name: 'children', type: 'component', required: false }
        ]
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('React.ReactNode');
    });
  });

  describe('Styles 생성', () => {
    test('styles 객체가 함수 외부에 생성됨', async () => {
      const result = await generateReactCode(simpleButtonSpec);
      const validation = validateGeneratedCode(result.code);

      expect(validation.stylesBeforeFunction).toBe(true);
    });

    test('container 스타일에 layout 정보 포함', async () => {
      const result = await generateReactCode(simpleButtonSpec);
      
      expect(result.code).toContain('container: {');
      expect(result.code).toContain("display: 'flex'");
      expect(result.code).toContain("flexDirection: 'row'");
      expect(result.code).toContain("alignItems: 'center'");
    });

    test('중복된 이름은 고유 키로 생성', async () => {
      const spec = {
        metadata: { name: 'Test' },
        componentStructure: {
          elements: [
            { id: '1', name: 'icon', type: 'INSTANCE', width: 24, height: 24 },
            { id: '2', name: 'icon', type: 'INSTANCE', width: 24, height: 24 }
          ]
        }
      };

      const result = await generateReactCode(spec);
      
      expect(result.code).toContain('icon:');
      expect(result.code).toContain('icon2:');
    });
  });

  describe('Element Bindings', () => {
    test('TEXT 요소가 prop에 바인딩됨', async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code).toContain('{text}');
    });

    test('prop: prefix가 제거됨', async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code).toContain('{text}');
      expect(result.code).not.toContain('{prop:text}');
    });

    test('INSTANCE 요소도 바인딩 가능', async () => {
      const spec = {
        metadata: { name: 'Test' },
        propsDefinition: [
          { name: 'leftIcon', type: 'component', required: false }
        ],
        componentStructure: {
          elements: [
            { id: '1', name: 'icon', type: 'INSTANCE' }
          ]
        },
        elementBindings: {
          '1': {
            elementId: '1',
            connectedPropName: 'prop:leftIcon',
            visibleMode: 'always'
          }
        }
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('{leftIcon}');
    });
  });

  describe('Internal State 생성', () => {
    test('useState import가 포함됨', async () => {
      const spec = {
        metadata: { name: 'Test' },
        internalStateDefinition: [
          { name: 'count', type: 'number', initialValue: 0 }
        ]
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("import { useState } from \"react\"");
    });

    test('useState 호출이 생성됨', async () => {
      const spec = {
        metadata: { name: 'Test' },
        internalStateDefinition: [
          { name: 'count', type: 'number', initialValue: 0 }
        ]
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('const [count, setCount] = useState(0);');
    });

    test('state가 없으면 import도 없음', async () => {
      const spec = {
        metadata: { name: 'Test' },
        internalStateDefinition: []
      };

      const result = await generateReactCode(spec);
      expect(result.code).not.toContain('import { useState }');
    });
  });

  describe('Visibility 조건부 렌더링', () => {
    test('visibleMode: hidden은 렌더링 안 됨', async () => {
      const spec = {
        metadata: { name: 'Test' },
        componentStructure: {
          elements: [
            { id: '1', type: 'TEXT', name: 'HiddenText' }
          ]
        },
        elementBindings: {
          '1': {
            elementId: '1',
            visibleMode: 'hidden'
          }
        }
      };

      const result = await generateReactCode(spec);
      // return 문 안에 해당 요소가 없어야 함
      const returnSection = result.code.split('return (')[1];
      expect(returnSection).toBeDefined();
      // span 태그가 없어야 함 (TEXT는 span으로 변환됨)
      const returnLines = returnSection?.split('}')[0] || '';
      expect(returnLines.includes('<span')).toBe(false);
    });

    test('visibleMode: expression은 조건부 렌더링', async () => {
      const spec = {
        metadata: { name: 'Test' },
        propsDefinition: [
          { name: 'showTitle', type: 'boolean', required: false }
        ],
        componentStructure: {
          elements: [
            { id: '1', type: 'TEXT', name: 'Title' }
          ]
        },
        elementBindings: {
          '1': {
            elementId: '1',
            connectedPropName: 'prop:title',
            visibleMode: 'expression',
            visibleExpression: 'prop:showTitle'
          }
        }
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('{showTitle &&');
    });

    test('visibleExpression에서 prop:/state: prefix 제거', async () => {
      const spec = {
        metadata: { name: 'Test' },
        propsDefinition: [
          { name: 'isOpen', type: 'boolean', required: false }
        ],
        internalStateDefinition: [
          { name: 'count', type: 'number', initialValue: 0 }
        ],
        componentStructure: {
          elements: [
            { id: '1', type: 'TEXT', name: 'Text' }
          ]
        },
        elementBindings: {
          '1': {
            elementId: '1',
            visibleMode: 'expression',
            visibleExpression: 'prop:isOpen && state:count > 0'
          }
        }
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('{isOpen && count > 0 &&');
      expect(result.code).not.toContain('prop:');
      expect(result.code).not.toContain('state:');
    });
  });

  describe('rootElement 처리', () => {
    test('rootElement가 button이면 <button> 사용', async () => {
      const spec = {
        metadata: { name: 'Test', rootElement: 'button' },
        componentStructure: {
          elements: [
            { id: '1', type: 'TEXT', name: 'text' }
          ]
        }
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('<button');
      expect(result.code).toContain('</button>');
    });

    test('rootElement가 div이면 Fragment 사용', async () => {
      const spec = {
        metadata: { name: 'Test', rootElement: 'div' },
        componentStructure: {
          elements: [
            { id: '1', type: 'TEXT', name: 'text' }
          ]
        }
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('<>');
      expect(result.code).toContain('</>');
    });
  });

  describe('Export 문', () => {
    test('export default 포함', async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code).toContain('export default SimpleButton;');
    });
  });

  describe('Integration: 전체 코드 생성', () => {
    test('SimpleButton: 완전한 코드 생성', async () => {
      const result = await generateReactCode(simpleButtonSpec);

      // 전체 구조 검증
      const validation = validateGeneratedCode(result.code);
      expect(validation.hasInterface).toBe(true);
      expect(validation.hasStyles).toBe(true);
      expect(validation.hasFunction).toBe(true);
      expect(validation.hasReturn).toBe(true);
      expect(validation.hasExport).toBe(true);
      expect(validation.stylesBeforeFunction).toBe(true);

      // 내용 검증
      expect(result.code).toContain('interface SimpleButtonProps');
      expect(result.code).toContain('text: string');
      expect(result.code).toContain('const styles = {');
      expect(result.code).toContain('container: {');
      expect(result.code).toContain('function SimpleButton');
      expect(result.code).toContain('<button style={styles.container}>');
      expect(result.code).toContain('{text}');
      expect(result.code).toContain('export default SimpleButton');

      // 출력 (디버깅용)
      console.log('\n=== Generated Code ===\n');
      console.log(result.code);
      console.log('\n=== End ===\n');
    });
  });
});

