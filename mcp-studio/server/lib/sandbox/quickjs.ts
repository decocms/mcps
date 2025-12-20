import {
  newQuickJSWASMModule,
  type QuickJSWASMModule,
} from "quickjs-emscripten";

let quickJSSingleton: Promise<QuickJSWASMModule> | undefined;

export function getQuickJS() {
  quickJSSingleton ??= newQuickJSWASMModule();
  return quickJSSingleton;
}
