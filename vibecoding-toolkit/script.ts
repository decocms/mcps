const ts = require("typescript");

function convertTsToJs(tsCode) {
  const result = ts.transpileModule(tsCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2015,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
    },
  });

  return result.outputText;
}

// Usage
const jsCode = convertTsToJs(`
export default (input) => {
  const upperCase = input.name.toUpperCase();
  return {
    upperCaseName: input.name.toUpperCase()
  }
};`);

console.log(jsCode);
