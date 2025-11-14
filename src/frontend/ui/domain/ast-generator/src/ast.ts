// AST 노드 공통
export interface BaseASTNode {
  id: string;
  name: string;
}

export interface ElementASTNode extends BaseASTNode {
  kind: "Element";
  tag: string;
  originalType: string; // Figma node.type 저장
  props: {
    style?: Record<string, any>;
    [key: string]: any;
  };
  children: ElementASTNode[];
  textContent?: string | null; // TEXT용 텍스트 (없으면 null)
}

export interface ComponentAST {
  kind: "Component";
  name: string;
  root: ElementASTNode;
}

