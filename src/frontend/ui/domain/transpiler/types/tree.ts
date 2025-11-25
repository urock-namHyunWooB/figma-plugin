export type FigmaNodeTree = {
  meta: Record<string, unknown>;
  id: string;
  children?: FigmaNodeTree[];
  [key: string]: any;
};
