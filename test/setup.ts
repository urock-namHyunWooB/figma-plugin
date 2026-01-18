import "@testing-library/jest-dom";
import "@testing-library/jest-dom/vitest";

// 테스트 환경에서 console.log 비활성화
if (typeof global !== "undefined") {
  const originalConsole = global.console;
  global.console = {
    ...originalConsole,
    log: () => {},
    info: () => {},
    debug: () => {},
    // warn과 error는 유지 (중요한 에러는 확인 가능)
  };
}
