// Ensure a minimal store exists on window or globalThis so early axios
// interceptors that read it don't crash before tests render.
(() => {
    const g = globalThis as unknown as {
        window?: { store?: unknown };
        store?: unknown;
    };
    if (g.window && !g.window.store) {
        g.window.store = {
            getState: () => ({}),
            dispatch: () => {},
            subscribe: () => () => {},
        } as unknown;
    }
    if (!g.window && !g.store) {
        g.store = {
            getState: () => ({}),
            dispatch: () => {},
            subscribe: () => () => {},
        } as unknown;
    }
})();

export * from './types';
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
export { createKitNative } from './createKitNative';
