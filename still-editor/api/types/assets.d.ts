// `import path from "x.wasm" with { type: "file" }`: Bun emits the file next to
// the bundle and the import is its path.
declare module "*.wasm" {
  const path: string;
  export default path;
}
