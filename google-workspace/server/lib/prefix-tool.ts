/**
 * Wrap a tool factory imported from another MCP package so the produced tool's
 * id is namespaced with a service prefix.
 *
 * Each child MCP's tools array is `Array<(env) => Tool>`. We can't change the
 * factory signature, but we can clone the resulting tool with a new id.
 *
 * The Env types between MCPs differ structurally (each has its own deco.gen.ts)
 * but the only field tools actually read is `MESH_REQUEST_CONTEXT.authorization`,
 * which is identical everywhere. The cast below is therefore safe in practice.
 */

// biome-ignore lint/suspicious/noExplicitAny: child Env types differ but are
// structurally compatible at runtime — see comment above.
type AnyToolFactory = (env: any) => { id: string; [k: string]: unknown };

export function prefixToolFactory(
  factory: AnyToolFactory,
  prefix: string,
): AnyToolFactory {
  return (env) => {
    const tool = factory(env);
    return { ...tool, id: `${prefix}_${tool.id}` };
  };
}

export function prefixToolFactories(
  factories: ReadonlyArray<AnyToolFactory>,
  prefix: string,
): AnyToolFactory[] {
  return factories.map((f) => prefixToolFactory(f, prefix));
}
