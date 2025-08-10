// Ensure a minimal store exists on window or globalThis so early axios
// interceptors that read it don't crash before tests render.
(() => {
    const globalScope = globalThis as unknown as {
        window?: { store?: unknown };
        store?: unknown;
    };
    if (globalScope.window && !globalScope.window.store) {
        globalScope.window.store = {
            getState: () => ({}),
            dispatch: () => {},
            subscribe: () => () => {},
        } as unknown;
    }
    if (!globalScope.window && !globalScope.store) {
        globalScope.store = {
            getState: () => ({}),
            dispatch: () => {},
            subscribe: () => () => {},
        } as unknown;
    }
})();

export type * from './types/core';
export type * from './types/web';
export * from './helpers/definePlugin';
export { createKit } from './createKit';
export { makeKitBuilder } from './kitBuilder';
export { defaultPlugins } from './defaultPlugins';
export * from './plugins/flow';
export * from './plugins/api';
export * from './plugins/keyboard';
export * from './plugins/datePlugin';
export * from './plugins/performance';
export * from './plugins/dnd';
export * from './plugins/interactionsPlugin';
export * from './plugins/page';
export * from './plugins/state';
export { configureRedux } from './redux/config';
export * from './plugins/router';
export { setupTestKit } from './setup';
export { configureRouter } from './router/config';
