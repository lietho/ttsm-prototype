/**
 * Provides a mechanism to use dynamic import / import() with tsconfig -> module: commonJS as otherwise import() gets
 * transpiled to require().
 * src: https://github.com/oclif/core/blob/main/src/module-loader.ts
 */
export const importDynamic = new Function('modulePath', 'return import(modulePath)')