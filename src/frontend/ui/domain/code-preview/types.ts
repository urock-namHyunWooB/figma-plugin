export interface ComponentPreviewProps {
  code: string;
  propsDefinition?: Array<{
    name: string;
    type: string;
    defaultValue?: any;
    variantOptions?: string[];
    readonly?: boolean;
  }>;
  onError?: (error: Error) => void;
}

export type ViewMode = "single" | "list" | "grid" | "all";

