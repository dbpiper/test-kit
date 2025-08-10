/* eslint-disable no-underscore-dangle */
import type { ComponentType, ReactNode } from 'react';

import {
    configureRedux,
    type MinimalMiddleware,
    type MinimalStore,
    type ReduxEnvironment,
} from './redux/config';
import { configureRouter, type RouterEnvironment } from './router/config';
import { apiPlugin } from './plugins/api';

export type SetupTestKitOptions<S> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeStore: (preloadedState?: any) => MinimalStore<S>;
    contextProviders?: ComponentType<{ children?: ReactNode }>[];
    middlewares?: MinimalMiddleware[];
    router?: RouterEnvironment;
    // Optional: force web or native boot. If omitted, auto-detects.
    mode?: 'web' | 'native';
};

export function setupTestKit<S>(options: SetupTestKitOptions<S>): void {
    // Initialize test-kit default plugins early so global interceptors
    // (fetch/XMLHttpRequest/axios adapter) are installed before any app
    // code imports axios in tests. Idempotent across multiple calls.
    const bootState = globalThis as unknown as {
        __testKitBoot?: unknown;
        __testKitApiInstalled?: boolean;
    };
    if (!bootState.__testKitApiInstalled) {
        // Install API interceptors synchronously; this does not depend on platform
        // @ts-expect-error ignore type error
        apiPlugin().setup({} as unknown as Record<string, unknown>);
        bootState.__testKitApiInstalled = true;
    }
    if (!bootState.__testKitBoot) {
        // Choose web or native without importing platform libs at module scope
        const isNative = (() => {
            if (options.mode) {
                return options.mode === 'native';
            }
            try {
                // RN preset sets navigator.product = 'ReactNative'
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const nav = (globalThis as any).navigator;
                const prod =
                    typeof nav?.product === 'string' ? nav.product : '';
                return prod.toLowerCase() === 'reactnative';
            } catch {
                return false;
            }
        })();

        try {
            if (isNative) {
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                const { createKitNative } = require('./createKitNative');
                bootState.__testKitBoot = createKitNative();
            } else {
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                const { createKit } = require('./createKit');
                bootState.__testKitBoot = createKit();
            }
        } catch {
            // Swallow; API interceptors are already installed
        }
    }
    const globalScope = globalThis as unknown as {
        window?: { store?: unknown };
        store?: unknown;
    };
    if (globalScope.window && !globalScope.window.store) {
        globalScope.window.store = {
            getState: () => ({}),
            dispatch: () => undefined,
            subscribe: () => () => undefined,
        } as unknown;
    }
    if (!globalScope.window && !globalScope.store) {
        globalScope.store = {
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
