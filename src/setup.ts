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
    if (typeof window !== 'undefined') {
        const windowWithMaybeStore = window as unknown as {
            store?: {
                getState: () => unknown;
                dispatch: (...args: unknown[]) => unknown;
                subscribe: (listener: () => void) => () => void;
            };
        };
        if (!windowWithMaybeStore.store) {
            windowWithMaybeStore.store = {
                getState: () => ({}),
                dispatch: () => undefined,
                subscribe: () => () => undefined,
            };
        }
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
