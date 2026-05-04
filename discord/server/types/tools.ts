export type ToolFactory<TEnv> = (env: TEnv) => unknown;

export type ToolCollection<TEnv> = ToolFactory<TEnv>[];
