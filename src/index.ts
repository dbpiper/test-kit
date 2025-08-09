// Ensure a minimal window.store exists as early as possible so consumer axios
// interceptors that read window.store don't crash before tests render.
(() => {
    if (
        typeof window !== 'undefined' &&
        !(window as unknown as { store?: unknown }).store
    ) {
        (window as unknown as { store: unknown }).store = {
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
