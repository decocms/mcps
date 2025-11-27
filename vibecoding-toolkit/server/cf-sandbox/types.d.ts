// For importing WASM as binary
declare module "*.wasm" {
  const wasmModule: ArrayBuffer;
  export default wasmModule;
}
