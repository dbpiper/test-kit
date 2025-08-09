import type { ComponentType, ReactNode } from 'react';

import type {
    MinimalMiddleware,
    MinimalStore,
    ReduxEnvironment,
} from './redux/config';
import { configureRedux } from './redux/config';
import type { RouterEnvironment } from './router/config';
import { configureRouter } from './router/config';

export type SetupTestKitOptions<S> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeStore: (preloadedState?: any) => MinimalStore<S>;
    contextProviders?: ComponentType<{ children?: ReactNode }>[];
    middlewares?: MinimalMiddleware[];
    router?: RouterEnvironment;
};

export function setupTestKit<S>(options: SetupTestKitOptions<S>): void {
    if (typeof window !== 'undefined' && !(window as any).store) {
        (window as any).store = {
            getState: () => ({}),
            dispatch: () => {},
            subscribe: () => () => {},
        };
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
