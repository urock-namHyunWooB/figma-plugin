import { StyleTree } from "@frontend/ui/domain/compiler";

export type RenderTree = StyleTree;

export type PropsDef = Record<string, any>;

export type SuperTreeNode = {
  id: string;
  type: string;
  name: string;
  parent: SuperTreeNode | null;
  children: (SuperTreeNode | undefined)[];
};
