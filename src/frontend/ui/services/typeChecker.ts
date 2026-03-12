/**
 * TypeChecker — 인메모리 TypeScript 타입 체크 서비스
 *
 * Deploy 전에 생성된 코드의 TS 타입 에러를 검출하여
 * CI 실패를 사전에 차단한다.
 *
 * - ts.createCompilerHost를 커스텀하여 인메모리 파일 시스템 제공
 * - React/Emotion 최소 타입 스텁으로 full @types/react 없이 동작
 * - design-system의 tsconfig 옵션과 맞춤 (strict, react-jsx, ES2020)
 */

import ts from "typescript";

// ──────────────────────────────────────────────
// 최소 타입 스텁 (인메모리)
// ──────────────────────────────────────────────

const REACT_TYPES = `
declare module "react" {
  export type ReactNode =
    | string
    | number
    | boolean
    | null
    | undefined
    | ReactElement
    | Iterable<ReactNode>;

  export interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    type: T;
    props: P;
    key: string | null;
  }

  export type JSXElementConstructor<P> = (props: P) => ReactElement | null;

  export type FC<P = {}> = (props: P) => ReactElement | null;

  export interface CSSProperties {
    [key: string]: string | number | undefined;
  }

  export interface HTMLAttributes<T = Element> {
    className?: string;
    style?: CSSProperties;
    id?: string;
    onClick?: (e: any) => void;
    onMouseEnter?: (e: any) => void;
    onMouseLeave?: (e: any) => void;
    onFocus?: (e: any) => void;
    onBlur?: (e: any) => void;
    onChange?: (e: any) => void;
    onInput?: (e: any) => void;
    onKeyDown?: (e: any) => void;
    onKeyUp?: (e: any) => void;
    children?: ReactNode;
    disabled?: boolean;
    tabIndex?: number;
    role?: string;
    title?: string;
    "aria-label"?: string;
    "aria-hidden"?: boolean;
    "aria-disabled"?: boolean;
    "aria-checked"?: boolean | "mixed";
    "aria-expanded"?: boolean;
    "aria-selected"?: boolean;
    [key: string]: any;
  }

  export interface SVGAttributes<T = SVGElement> extends HTMLAttributes<T> {
    viewBox?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: string | number;
    d?: string;
    cx?: string | number;
    cy?: string | number;
    r?: string | number;
    x?: string | number;
    y?: string | number;
    width?: string | number;
    height?: string | number;
    rx?: string | number;
    ry?: string | number;
    xmlns?: string;
    clipPath?: string;
    clipRule?: string;
    fillRule?: string;
    strokeLinecap?: string;
    strokeLinejoin?: string;
    transform?: string;
    opacity?: string | number;
    [key: string]: any;
  }

  export interface InputHTMLAttributes<T = HTMLInputElement> extends HTMLAttributes<T> {
    type?: string;
    value?: string | number | readonly string[];
    defaultValue?: string | number | readonly string[];
    placeholder?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    name?: string;
    readOnly?: boolean;
    required?: boolean;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    autoFocus?: boolean;
    autoComplete?: string;
  }

  export interface ButtonHTMLAttributes<T = HTMLButtonElement> extends HTMLAttributes<T> {
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    form?: string;
    name?: string;
    value?: string | readonly string[] | number;
  }

  export interface AnchorHTMLAttributes<T = HTMLAnchorElement> extends HTMLAttributes<T> {
    href?: string;
    target?: string;
    rel?: string;
    download?: any;
  }

  export interface ImgHTMLAttributes<T = HTMLImageElement> extends HTMLAttributes<T> {
    src?: string;
    alt?: string;
    width?: string | number;
    height?: string | number;
    loading?: "eager" | "lazy";
  }

  export interface LabelHTMLAttributes<T = HTMLLabelElement> extends HTMLAttributes<T> {
    htmlFor?: string;
  }

  export interface TextareaHTMLAttributes<T = HTMLTextAreaElement> extends HTMLAttributes<T> {
    value?: string | readonly string[];
    defaultValue?: string;
    placeholder?: string;
    rows?: number;
    cols?: number;
    maxLength?: number;
    readOnly?: boolean;
    required?: boolean;
  }

  export function createElement(type: any, props?: any, ...children: any[]): ReactElement;
  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useRef<T>(initialValue: T): { current: T };
  export function useContext<T>(context: React.Context<T>): T;
  export function useReducer<R extends React.Reducer<any, any>>(reducer: R, initialState: any): [any, any];

  export type Reducer<S, A> = (state: S, action: A) => S;
  export interface Context<T> { Provider: any; Consumer: any; }

  export type Ref<T> = { current: T | null } | ((instance: T | null) => void) | null;
  export function forwardRef<T, P = {}>(render: (props: P, ref: Ref<T>) => ReactElement | null): FC<P & { ref?: Ref<T> }>;

  const React: {
    createElement: typeof createElement;
    useState: typeof useState;
    useEffect: typeof useEffect;
    useCallback: typeof useCallback;
    useMemo: typeof useMemo;
    useRef: typeof useRef;
    useContext: typeof useContext;
    useReducer: typeof useReducer;
    forwardRef: typeof forwardRef;
    ReactNode: ReactNode;
    FC: FC;
  };
  export default React;
}
`;

const REACT_JSX_RUNTIME_TYPES = `
declare module "react/jsx-runtime" {
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export const Fragment: any;
}

declare module "react/jsx-dev-runtime" {
  export function jsxDEV(type: any, props: any, key?: any, isStatic?: boolean, source?: any, self?: any): any;
  export const Fragment: any;
}
`;

const EMOTION_TYPES = `
declare module "@emotion/react" {
  export interface SerializedStyles {
    name: string;
    styles: string;
    map?: string;
    next?: SerializedStyles;
  }
  export function css(template: TemplateStringsArray, ...args: any[]): SerializedStyles;
  export function css(...args: any[]): SerializedStyles;
}

declare module "@emotion/react/jsx-runtime" {
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export const Fragment: any;
}

declare module "@emotion/styled" {
  const styled: any;
  export default styled;
}

declare module "@emotion/css" {
  export function css(template: TemplateStringsArray, ...args: any[]): string;
  export function css(...args: any[]): string;
}
`;

const CVA_TYPES = `
declare module "class-variance-authority" {
  export type VariantProps<T extends (...args: any) => any> = any;
  export function cva(base?: string, config?: {
    variants?: Record<string, Record<string, string>>;
    defaultVariants?: Record<string, string>;
    compoundVariants?: Array<Record<string, any> & { class?: string; className?: string }>;
  }): (...args: any[]) => string;
}
`;

const GLOBAL_JSX_TYPES = `
// 글로벌 React 네임스페이스 — React.ReactNode, React.FC 등 참조 지원
// import 없이 직접 정의 (import 사용 시 모듈 스코프 오염)
declare namespace React {
  type ReactNode =
    | string
    | number
    | boolean
    | null
    | undefined
    | ReactElement
    | Iterable<ReactNode>;

  interface ReactElement<P = any, T = any> {
    type: T;
    props: P;
    key: string | null;
  }

  type JSXElementConstructor<P> = (props: P) => ReactElement | null;
  type FC<P = {}> = (props: P) => ReactElement | null;
  type CSSProperties = Record<string, string | number | undefined>;

  interface HTMLAttributes<T = Element> {
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
    [key: string]: any;
  }

  interface SVGAttributes<T = SVGElement> extends HTMLAttributes<T> {
    [key: string]: any;
  }

  type Ref<T> = { current: T | null } | ((instance: T | null) => void) | null;
}

declare namespace JSX {
  interface Element {
    type: any;
    props: any;
    key: string | null;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
`;

// ──────────────────────────────────────────────
// 최소 ES lib 스텁 (Array, Record, Iterable 등)
// ──────────────────────────────────────────────

const LIB_STUB = `
interface Array<T> {
  length: number;
  [n: number]: T;
  push(...items: T[]): number;
  pop(): T | undefined;
  map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[];
  filter(predicate: (value: T, index: number, array: T[]) => unknown): T[];
  find(predicate: (value: T, index: number, obj: T[]) => unknown): T | undefined;
  findIndex(predicate: (value: T, index: number, obj: T[]) => unknown): number;
  forEach(callbackfn: (value: T, index: number, array: T[]) => void): void;
  reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
  includes(searchElement: T, fromIndex?: number): boolean;
  indexOf(searchElement: T, fromIndex?: number): number;
  join(separator?: string): string;
  slice(start?: number, end?: number): T[];
  splice(start: number, deleteCount?: number, ...items: T[]): T[];
  some(predicate: (value: T, index: number, array: T[]) => unknown): boolean;
  every(predicate: (value: T, index: number, array: T[]) => unknown): boolean;
  flat<D extends number = 1>(depth?: D): any[];
  flatMap<U>(callback: (value: T, index: number, array: T[]) => U | U[]): U[];
  concat(...items: (T | T[])[]): T[];
  reverse(): T[];
  sort(compareFn?: (a: T, b: T) => number): T[];
  fill(value: T, start?: number, end?: number): T[];
  entries(): IterableIterator<[number, T]>;
  keys(): IterableIterator<number>;
  values(): IterableIterator<T>;
  [Symbol.iterator](): IterableIterator<T>;
}
interface ArrayConstructor {
  new <T>(...items: T[]): T[];
  isArray(arg: any): arg is any[];
  from<T>(arrayLike: ArrayLike<T>): T[];
  from<T, U>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => U): U[];
  of<T>(...items: T[]): T[];
}
declare var Array: ArrayConstructor;

interface ReadonlyArray<T> {
  readonly length: number;
  readonly [n: number]: T;
  map<U>(callbackfn: (value: T, index: number, array: readonly T[]) => U): U[];
  filter(predicate: (value: T, index: number, array: readonly T[]) => unknown): T[];
  find(predicate: (value: T, index: number, obj: readonly T[]) => unknown): T | undefined;
  forEach(callbackfn: (value: T, index: number, array: readonly T[]) => void): void;
  includes(searchElement: T, fromIndex?: number): boolean;
  indexOf(searchElement: T, fromIndex?: number): number;
  join(separator?: string): string;
  slice(start?: number, end?: number): T[];
  some(predicate: (value: T, index: number, array: readonly T[]) => unknown): boolean;
  every(predicate: (value: T, index: number, array: readonly T[]) => unknown): boolean;
  reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: readonly T[]) => U, initialValue: U): U;
  [Symbol.iterator](): IterableIterator<T>;
}

interface String {
  length: number;
  charAt(pos: number): string;
  charCodeAt(index: number): number;
  indexOf(searchString: string, position?: number): number;
  lastIndexOf(searchString: string, position?: number): number;
  includes(searchString: string, position?: number): boolean;
  startsWith(searchValue: string, start?: number): boolean;
  endsWith(searchString: string, endPosition?: number): boolean;
  slice(start?: number, end?: number): string;
  substring(start: number, end?: number): string;
  toLowerCase(): string;
  toUpperCase(): string;
  trim(): string;
  trimStart(): string;
  trimEnd(): string;
  replace(searchValue: string | RegExp, replaceValue: string): string;
  split(separator: string | RegExp, limit?: number): string[];
  match(regexp: string | RegExp): RegExpMatchArray | null;
  search(regexp: string | RegExp): number;
  repeat(count: number): string;
  padStart(maxLength: number, fillString?: string): string;
  padEnd(maxLength: number, fillString?: string): string;
  toString(): string;
  valueOf(): string;
  [index: number]: string;
}
interface StringConstructor {
  new(value?: any): String;
  (value?: any): string;
  fromCharCode(...codes: number[]): string;
  raw(template: { raw: readonly string[] | ArrayLike<string> }, ...substitutions: any[]): string;
}
declare var String: StringConstructor;

interface Number {
  toString(radix?: number): string;
  toFixed(fractionDigits?: number): string;
  valueOf(): number;
}
interface NumberConstructor {
  new(value?: any): Number;
  (value?: any): number;
  readonly NaN: number;
  readonly MAX_SAFE_INTEGER: number;
  readonly MIN_SAFE_INTEGER: number;
  isNaN(number: unknown): boolean;
  isFinite(number: unknown): boolean;
  isInteger(number: unknown): boolean;
  parseInt(string: string, radix?: number): number;
  parseFloat(string: string): number;
}
declare var Number: NumberConstructor;

interface Boolean {
  valueOf(): boolean;
}
interface BooleanConstructor {
  new(value?: any): Boolean;
  <T>(value?: T): boolean;
}
declare var Boolean: BooleanConstructor;

interface Object {
  constructor: Function;
  toString(): string;
  valueOf(): Object;
  hasOwnProperty(v: string | number | symbol): boolean;
}
interface ObjectConstructor {
  new(value?: any): Object;
  (value?: any): any;
  keys(o: object): string[];
  values<T>(o: { [s: string]: T } | ArrayLike<T>): T[];
  entries<T>(o: { [s: string]: T } | ArrayLike<T>): [string, T][];
  assign<T extends {}, U>(target: T, source: U): T & U;
  assign<T extends {}, U, V>(target: T, source1: U, source2: V): T & U & V;
  freeze<T>(o: T): Readonly<T>;
  fromEntries<T = any>(entries: Iterable<readonly [PropertyKey, T]>): { [k: string]: T };
  create(o: object | null, properties?: PropertyDescriptorMap): any;
  defineProperty(o: any, p: PropertyKey, attributes: PropertyDescriptor & ThisType<any>): any;
  getOwnPropertyNames(o: any): string[];
}
declare var Object: ObjectConstructor;

interface Function {
  apply(thisArg: any, argArray?: any): any;
  call(thisArg: any, ...argArray: any[]): any;
  bind(thisArg: any, ...argArray: any[]): any;
  prototype: any;
  length: number;
  name: string;
}
interface FunctionConstructor {
  new(...args: string[]): Function;
  (...args: string[]): Function;
}
declare var Function: FunctionConstructor;

interface RegExp {
  exec(string: string): RegExpExecArray | null;
  test(string: string): boolean;
  source: string;
  global: boolean;
  ignoreCase: boolean;
  multiline: boolean;
  lastIndex: number;
}
interface RegExpMatchArray extends Array<string> {
  index?: number;
  input?: string;
  groups?: { [key: string]: string };
}
interface RegExpExecArray extends Array<string> {
  index: number;
  input: string;
  groups?: { [key: string]: string };
}
interface RegExpConstructor {
  new(pattern: string | RegExp, flags?: string): RegExp;
  (pattern: string | RegExp, flags?: string): RegExp;
}
declare var RegExp: RegExpConstructor;

interface Error {
  name: string;
  message: string;
  stack?: string;
}
interface ErrorConstructor {
  new(message?: string): Error;
  (message?: string): Error;
}
declare var Error: ErrorConstructor;

interface Map<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): this;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void): void;
  readonly size: number;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  entries(): IterableIterator<[K, V]>;
  [Symbol.iterator](): IterableIterator<[K, V]>;
}
interface MapConstructor {
  new <K, V>(entries?: readonly (readonly [K, V])[] | null): Map<K, V>;
}
declare var Map: MapConstructor;

interface Set<T> {
  add(value: T): this;
  has(value: T): boolean;
  delete(value: T): boolean;
  clear(): void;
  forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void): void;
  readonly size: number;
  keys(): IterableIterator<T>;
  values(): IterableIterator<T>;
  entries(): IterableIterator<[T, T]>;
  [Symbol.iterator](): IterableIterator<T>;
}
interface SetConstructor {
  new <T>(values?: readonly T[] | null): Set<T>;
}
declare var Set: SetConstructor;

interface WeakMap<K extends object, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): this;
  has(key: K): boolean;
  delete(key: K): boolean;
}
interface WeakMapConstructor {
  new <K extends object, V>(entries?: readonly [K, V][] | null): WeakMap<K, V>;
}
declare var WeakMap: WeakMapConstructor;

interface Promise<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2>;
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<T | TResult>;
  finally(onfinally?: (() => void) | null): Promise<T>;
}
interface PromiseLike<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}
interface PromiseConstructor {
  new <T>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): Promise<T>;
  resolve<T>(value: T | PromiseLike<T>): Promise<T>;
  resolve(): Promise<void>;
  reject<T = never>(reason?: any): Promise<T>;
  all<T extends readonly unknown[]>(values: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }>;
  race<T extends readonly unknown[]>(values: T): Promise<Awaited<T[number]>>;
}
declare var Promise: PromiseConstructor;

interface Symbol {
  readonly description: string | undefined;
  toString(): string;
  valueOf(): symbol;
}
interface SymbolConstructor {
  readonly iterator: unique symbol;
  readonly hasInstance: unique symbol;
  readonly toPrimitive: unique symbol;
  readonly toStringTag: unique symbol;
  readonly asyncIterator: unique symbol;
  (description?: string | number): symbol;
}
declare var Symbol: SymbolConstructor;

interface Iterable<T> {
  [Symbol.iterator](): Iterator<T>;
}
interface Iterator<T, TReturn = any, TNext = any> {
  next(...args: [] | [TNext]): IteratorResult<T, TReturn>;
  return?(value?: TReturn): IteratorResult<T, TReturn>;
  throw?(e?: any): IteratorResult<T, TReturn>;
}
interface IterableIterator<T> extends Iterator<T> {
  [Symbol.iterator](): IterableIterator<T>;
}
interface IteratorResult<T, TReturn = any> {
  done?: boolean;
  value: T;
}
interface AsyncIterable<T> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
}
interface AsyncIterator<T, TReturn = any, TNext = any> {
  next(...args: [] | [TNext]): Promise<IteratorResult<T, TReturn>>;
}

interface ArrayLike<T> {
  readonly length: number;
  readonly [n: number]: T;
}

interface TemplateStringsArray extends ReadonlyArray<string> {
  readonly raw: readonly string[];
}

interface Date {
  toString(): string;
  getTime(): number;
  valueOf(): number;
  toISOString(): string;
  toJSON(): string;
}
interface DateConstructor {
  new(): Date;
  new(value: number | string): Date;
  now(): number;
  parse(s: string): number;
}
declare var Date: DateConstructor;

interface JSON {
  parse(text: string, reviver?: (key: string, value: any) => any): any;
  stringify(value: any, replacer?: (key: string, value: any) => any, space?: string | number): string;
  stringify(value: any, replacer?: (number | string)[] | null, space?: string | number): string;
}
declare var JSON: JSON;

interface Math {
  readonly PI: number;
  abs(x: number): number;
  ceil(x: number): number;
  floor(x: number): number;
  max(...values: number[]): number;
  min(...values: number[]): number;
  pow(x: number, y: number): number;
  random(): number;
  round(x: number): number;
  sqrt(x: number): number;
  trunc(x: number): number;
  sign(x: number): number;
  log(x: number): number;
  log2(x: number): number;
  log10(x: number): number;
}
declare var Math: Math;

interface Console {
  log(...data: any[]): void;
  error(...data: any[]): void;
  warn(...data: any[]): void;
  info(...data: any[]): void;
  debug(...data: any[]): void;
}
declare var console: Console;

declare function setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): number;
declare function clearTimeout(id?: number): void;
declare function setInterval(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): number;
declare function clearInterval(id?: number): void;
declare function parseInt(string: string, radix?: number): number;
declare function parseFloat(string: string): number;
declare function isNaN(number: number): boolean;
declare function isFinite(number: number): boolean;
declare var undefined: undefined;
declare var NaN: number;
declare var Infinity: number;

type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
type Partial<T> = { [P in keyof T]?: T[P] };
type Required<T> = { [P in keyof T]-?: T[P] };
type Readonly<T> = { readonly [P in keyof T]: T[P] };
type Record<K extends keyof any, T> = { [P in K]: T };
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
type Exclude<T, U> = T extends U ? never : T;
type Extract<T, U> = T extends U ? T : never;
type NonNullable<T> = T & {};
type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;
type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;
type InstanceType<T extends abstract new (...args: any) => any> = T extends abstract new (...args: any) => infer R ? R : any;
type ConstructorParameters<T extends abstract new (...args: any) => any> = T extends abstract new (...args: infer P) => any ? P : never;
type Uppercase<S extends string> = intrinsic;
type Lowercase<S extends string> = intrinsic;
type Capitalize<S extends string> = intrinsic;
type Uncapitalize<S extends string> = intrinsic;
type PropertyKey = string | number | symbol;
type PropertyDescriptor = { configurable?: boolean; enumerable?: boolean; value?: any; writable?: boolean; get?(): any; set?(v: any): void; };
type PropertyDescriptorMap = { [key: PropertyKey]: PropertyDescriptor };
type ThisType<T> = {};

interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface IArguments {
  [index: number]: any;
  length: number;
  callee: Function;
}
`;

// ──────────────────────────────────────────────
// 타입 체크 인터페이스
// ──────────────────────────────────────────────

export interface TypeCheckResult {
  success: boolean;
  errors: TypeCheckError[];
}

export interface TypeCheckError {
  line: number;
  column: number;
  message: string;
  code: number;
}

// ──────────────────────────────────────────────
// 인메모리 파일 시스템
// ──────────────────────────────────────────────

const VIRTUAL_FILES: Record<string, string> = {
  "/@types/react/index.d.ts": REACT_TYPES,
  "/@types/react/jsx-runtime.d.ts": REACT_JSX_RUNTIME_TYPES,
  "/@types/emotion/index.d.ts": EMOTION_TYPES,
  "/@types/cva/index.d.ts": CVA_TYPES,
  "/globals.d.ts": GLOBAL_JSX_TYPES,
};

// ──────────────────────────────────────────────
// 컴파일러 옵션 (design-system의 tsconfig 기반)
// ──────────────────────────────────────────────

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  jsxImportSource: "@emotion/react",
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noEmit: true,
  // 외부 모듈 에러를 무시하기 위한 설정
  types: [],
  typeRoots: [],
};

// ──────────────────────────────────────────────
// 메인 함수
// ──────────────────────────────────────────────

/**
 * TypeScript 코드의 타입 체크를 수행한다.
 *
 * 인메모리 파일 시스템 위에서 ts.createProgram을 사용하므로
 * 디스크 I/O 없이 동작한다.
 *
 * @param code - 타입 체크할 TypeScript 코드
 * @param fileName - 가상 파일 이름 (기본값: "Component.tsx")
 * @returns 타입 체크 결과 (성공 여부 + 에러 목록)
 */
export function typeCheckCode(
  code: string,
  fileName: string = "Component.tsx"
): TypeCheckResult {
  const virtualPath = `/${fileName}`;

  // 모든 파일을 합쳐서 인메모리 파일 시스템 구성
  const files: Record<string, string> = {
    ...VIRTUAL_FILES,
    [virtualPath]: code,
  };

  // 커스텀 CompilerHost 생성
  const host = createInMemoryHost(files, COMPILER_OPTIONS);

  // Program 생성 및 진단 수집
  const program = ts.createProgram(
    [virtualPath, ...Object.keys(VIRTUAL_FILES)],
    COMPILER_OPTIONS,
    host
  );

  const sourceFile = program.getSourceFile(virtualPath);
  if (!sourceFile) {
    return {
      success: false,
      errors: [{ line: 0, column: 0, message: "Failed to parse source file", code: -1 }],
    };
  }

  // 구문 에러 + 시맨틱 에러 수집
  const diagnostics = [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ];

  if (diagnostics.length === 0) {
    return { success: true, errors: [] };
  }

  const errors: TypeCheckError[] = diagnostics.map((d) => {
    const pos = d.file && d.start !== undefined
      ? d.file.getLineAndCharacterOfPosition(d.start)
      : { line: 0, character: 0 };

    return {
      line: pos.line + 1,
      column: pos.character + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      code: d.code,
    };
  });

  return { success: false, errors };
}

// ──────────────────────────────────────────────
// 인메모리 CompilerHost
// ──────────────────────────────────────────────

function createInMemoryHost(
  files: Record<string, string>,
  options: ts.CompilerOptions
): ts.CompilerHost {
  const host: ts.CompilerHost = {
    getSourceFile(fileName, languageVersion) {
      const content = files[fileName];
      if (content !== undefined) {
        return ts.createSourceFile(fileName, content, languageVersion, true);
      }
      // lib 파일은 인메모리 스텁으로 대체 (브라우저 환경에서도 동작)
      if (fileName.includes("lib.") && fileName.endsWith(".d.ts")) {
        return ts.createSourceFile(fileName, LIB_STUB, languageVersion, true);
      }
      return undefined;
    },

    getDefaultLibFileName: () => "/lib.es2020.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (fileName) => {
      return fileName in files ||
        (fileName.includes("lib.") && fileName.endsWith(".d.ts"));
    },
    readFile: (fileName) => files[fileName] ?? "",

    resolveModuleNames(moduleNames, containingFile) {
      return moduleNames.map((moduleName): ts.ResolvedModule | undefined => {
        // react → /@types/react/index.d.ts
        if (moduleName === "react") {
          return { resolvedFileName: "/@types/react/index.d.ts" };
        }
        // react/jsx-runtime → /@types/react/jsx-runtime.d.ts
        if (moduleName === "react/jsx-runtime" || moduleName === "react/jsx-dev-runtime") {
          return { resolvedFileName: "/@types/react/jsx-runtime.d.ts" };
        }
        // @emotion/* → /@types/emotion/index.d.ts
        if (moduleName.startsWith("@emotion/")) {
          return { resolvedFileName: "/@types/emotion/index.d.ts" };
        }
        // class-variance-authority → /@types/cva/index.d.ts
        if (moduleName === "class-variance-authority") {
          return { resolvedFileName: "/@types/cva/index.d.ts" };
        }
        // 상대 경로 import (번들 내 sub-component) → any 타입으로 처리
        if (moduleName.startsWith("./") || moduleName.startsWith("../")) {
          return undefined;
        }
        return undefined;
      });
    },

    getDirectories: () => [],
    directoryExists: () => true,
  };

  return host;
}
