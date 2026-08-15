import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";

export type LinkStyle = "keep" | "bold" | "plain";

export type ExportFormat = "markdown" | "zip";

export interface ExportSettings {
  defaultFormat: ExportFormat;
  includeParentPath: boolean;
  linkStyle: LinkStyle;
  headingForRefs: string;
}

export interface LinkedRefGroup {
  page: PageEntity;
  blocks: BlockEntity[];
}

export interface ExportBundle {
  page: PageEntity;
  body: BlockEntity[];
  linkedRefs: LinkedRefGroup[];
}

export interface SerializeOptions {
  includeParentPath: boolean;
  linkStyle: LinkStyle;
  headingForRefs: string;
}
