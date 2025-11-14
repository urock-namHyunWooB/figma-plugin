import { PropDefinition } from "@backend/managers/MetadataManager";

export interface ComponentPreviewProps {
  code: string;
  propsDefinition?: PropDefinition[];
  onError?: (error: Error) => void;
}

export type ViewMode = "single" | "list" | "grid" | "all";
