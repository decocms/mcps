import variant from "@jitl/quickjs-wasmfile-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";

// Import WASM directly as binary (not as URL)
import wasmBinary from "./wasm/emscripten-module.wasm";

let quickJSSingleton: Promise<QuickJSWASMModule> | undefined;

export async function getQuickJS() {
  if (!quickJSSingleton) {
    quickJSSingleton = (async () => {
      // Create a custom variant with the WASM binary
      const customVariant = newVariant(variant, {
        wasmModule: wasmBinary,
      });
      
      return newQuickJSWASMModuleFromVariant(customVariant);
    })();
  }
  return quickJSSingleton;
}