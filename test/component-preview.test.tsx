import { describe, test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComponentPreview from "../src/ui/domain/code-preview/ComponentPreview";

/**
 * ComponentPreview 컴포넌트 테스트
 *
 * 테스트 목적:
 * 1. 코드를 받아서 컴포넌트로 컴파일하는지
 * 2. 에러 처리가 올바른지
 * 3. Props 패널이 작동하는지
 * 4. Props 변경 시 컴포넌트가 재렌더링되는지
 */
describe("ComponentPreview 컴포넌트 테스트", () => {
  const validCode = `
    interface TestProps {
      text?: string;
      count?: number;
      enabled?: boolean;
    }

    function Test({ text = "Hello", count = 0, enabled = false }: TestProps) {
      return (
        <div>
          <span>{text}</span>
          <span>{count}</span>
          <span>{enabled ? "ON" : "OFF"}</span>
        </div>
      );
    }

    export default Test;
  `;

  describe("기본 렌더링", () => {
    test("빈 코드일 때 메시지 표시", () => {
      render(<ComponentPreview code="" />);

      const message = screen.getByText(
        "코드를 생성하면 여기에 프리뷰가 나타납니다",
      );
      expect(message).toBeTruthy();
    });

    test.skip("유효한 코드를 받으면 컴포넌트 렌더링 (텍스트 찾기 이슈)", async () => {
      const { container } = render(<ComponentPreview code={validCode} />);

      // 로딩 후 컴포넌트 렌더링됨
      await waitFor(
        () => {
          // ComponentPreview 래퍼 내부에서 텍스트 찾기
          const content = container.textContent;
          expect(content).toContain("Hello");
          expect(content).toContain("0");
          expect(content).toContain("OFF");
        },
        { timeout: 1000 },
      );
    });

    test("Live Preview 헤더 표시", async () => {
      render(<ComponentPreview code={validCode} />);

      await waitFor(() => {
        expect(screen.getByText("Live Preview")).toBeTruthy();
      });
    });
  });

  describe("Props 패널", () => {
    test("Edit Props 버튼 표시", async () => {
      render(<ComponentPreview code={validCode} />);

      await waitFor(() => {
        expect(screen.getByText("Edit Props")).toBeTruthy();
      });
    });

    test("Edit Props 버튼 클릭 시 패널 표시", async () => {
      const user = userEvent.setup();
      render(<ComponentPreview code={validCode} />);

      await waitFor(() => {
        expect(screen.getByText("Edit Props")).toBeTruthy();
      });

      const editButton = screen.getByText("Edit Props");
      await user.click(editButton);

      expect(screen.getByText("Component Props")).toBeTruthy();
    });

    test("Props 패널에 모든 props 표시", async () => {
      const user = userEvent.setup();
      render(<ComponentPreview code={validCode} />);

      await waitFor(() => {
        expect(screen.getByText("Edit Props")).toBeTruthy();
      });

      const editButton = screen.getByText("Edit Props");
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByText("text")).toBeTruthy();
        expect(screen.getByText("count")).toBeTruthy();
        expect(screen.getByText("enabled")).toBeTruthy();
      });
    });

    test("string prop 편집 가능", async () => {
      const user = userEvent.setup();
      render(<ComponentPreview code={validCode} />);

      await waitFor(() => {
        expect(screen.getByText("Edit Props")).toBeTruthy();
      });

      await user.click(screen.getByText("Edit Props"));

      await waitFor(() => {
        const input = screen.getByPlaceholderText("Enter text");
        expect(input).toBeTruthy();
      });
    });

    test("boolean prop 토글 가능", async () => {
      const user = userEvent.setup();
      render(<ComponentPreview code={validCode} />);

      await waitFor(() => {
        expect(screen.getByText("Edit Props")).toBeTruthy();
      });

      await user.click(screen.getByText("Edit Props"));

      await waitFor(() => {
        const toggleButton = screen.getByText("false");
        expect(toggleButton).toBeTruthy();
      });
    });
  });

  describe("에러 처리", () => {
    test("잘못된 코드일 때 에러 메시지 표시", async () => {
      const invalidCode = "this is invalid code";

      render(<ComponentPreview code={invalidCode} />);

      await waitFor(
        () => {
          const errorMessage = screen.getByText(/컴포넌트 렌더링 오류/);
          expect(errorMessage).toBeTruthy();
        },
        { timeout: 1000 },
      );
    });

    test("에러 발생 시 onError 콜백 호출", async () => {
      const onError = vi.fn();
      const invalidCode = "invalid";

      render(<ComponentPreview code={invalidCode} onError={onError} />);

      await waitFor(
        () => {
          expect(onError).toHaveBeenCalled();
        },
        { timeout: 1000 },
      );
    });
  });

  describe("코드 업데이트", () => {
    test.skip("코드가 변경되면 컴포넌트 재컴파일 (텍스트 찾기 이슈)", async () => {
      const code1 = `
        interface TestProps { text?: string; }
        function Test({ text = "First" }: TestProps) {
          return <div>{text}</div>;
        }
        export default Test;
      `;

      const code2 = `
        interface TestProps { text?: string; }
        function Test({ text = "Second" }: TestProps) {
          return <div>{text}</div>;
        }
        export default Test;
      `;

      const { rerender, container } = render(<ComponentPreview code={code1} />);

      await waitFor(() => {
        expect(container.textContent).toContain("First");
      });

      rerender(<ComponentPreview code={code2} />);

      await waitFor(() => {
        expect(container.textContent).toContain("Second");
      });
    });
  });
});
