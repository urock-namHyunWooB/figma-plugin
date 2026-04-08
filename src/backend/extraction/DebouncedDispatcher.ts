/**
 * 디바운스된 핸들러 디스패처.
 *
 * - schedule: delayMs 안에 재호출되면 timer 리셋
 * - 발화 시 generation counter 증가, handler에 isCurrent() 콜백 전달
 * - handler는 await 끝났을 때 isCurrent()로 stale 여부 확인 → false면 결과 폐기
 * - fireImmediate: 디바운스 우회, 즉시 발화 (예: REQUEST_REFRESH)
 *
 * 단일 활성 timer만 유지. 실행 중 핸들러는 중단 안 함 — 대신 stale 검사로 결과를 버림.
 */
export class DebouncedDispatcher<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingArg: T | null = null;
  private generation = 0;

  constructor(
    private readonly delayMs: number,
    private readonly handler: (arg: T, isCurrent: () => boolean) => Promise<void> | void,
  ) {}

  schedule(arg: T): void {
    this.pendingArg = arg;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const fired = this.pendingArg as T;
      this.pendingArg = null;
      this.fire(fired);
    }, this.delayMs);
  }

  fireImmediate(arg: T): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.pendingArg = null;
    }
    this.fire(arg);
  }

  private fire(arg: T): void {
    const myGen = ++this.generation;
    const isCurrent = (): boolean => myGen === this.generation;
    void Promise.resolve(this.handler(arg, isCurrent));
  }
}
