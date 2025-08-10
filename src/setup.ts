import type { ComponentType, ReactNode } from 'react';

import {
    configureRedux,
    type MinimalMiddleware,
    type MinimalStore,
    type ReduxEnvironment,
} from './redux/config';
import { configureRouter, type RouterEnvironment } from './router/config';

export type SetupTestKitOptions<S> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeStore: (preloadedState?: any) => MinimalStore<S>;
    contextProviders?: ComponentType<{ children?: ReactNode }>[];
    middlewares?: MinimalMiddleware[];
    router?: RouterEnvironment;
};

export function setupTestKit<S>(options: SetupTestKitOptions<S>): void {
    const g = globalThis as unknown as {
        window?: { store?: unknown };
        store?: unknown;
    };
    if (g.window && !g.window.store) {
        g.window.store = {
            getState: () => ({}),
            dispatch: () => undefined,
            subscribe: () => () => undefined,
        } as unknown;
    }
    if (!g.window && !g.store) {
        g.store = {
            getState: () => ({}),
            dispatch: () => undefined,
            subscribe: () => () => undefined,
        } as unknown;
    }

    const env: ReduxEnvironment<S> = {
        makeStore: options.makeStore,
        contextProviders: options.contextProviders,
        middlewares: options.middlewares,
    };

    configureRedux<S>(env);

    if (options.router) {
        configureRouter(options.router);
    }
}
