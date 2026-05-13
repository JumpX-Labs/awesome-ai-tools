export type ToolItem = {
  name: string;
  url: string;
  description: string;
};

export type ToolCategory = {
  name: string;
  items: ToolItem[];
};

export type ToolsPayload = {
  siteTitle: string;
  tagline: string;
  categories: ToolCategory[];
};

export type FlatTool = ToolItem & { category: string };

export const ALL_CATEGORY_ID = "__all__" as const;
