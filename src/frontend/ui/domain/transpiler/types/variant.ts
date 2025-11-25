import { DiffTree } from "./figma-api";

export interface VariantStyleMap {
  [key: string]: Record<string, DiffTree | null> | "SLOT";
}
