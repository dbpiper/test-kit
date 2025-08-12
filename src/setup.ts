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
import { resolveModes, type TestKitMode } from './runtime/detectTestPlatform';

export type SetupTestKitOptions<S> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeStore: (preloadedState?: any) => MinimalStore<S>;
    contextProviders?: ComponentType<{ children?: ReactNode }>[];
    middlewares?: MinimalMiddleware[];
    router?: RouterEnvironment;
    // Optional: select platforms to prepare. Defaults to preparing both.
    mode?: 'web' | 'native' | 'both';
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
        const modes: Array<TestKitMode> = resolveModes(options.mode);

        // Bridge the Testing Library instances used by tests into globals
        // so consumer libraries resolve the same module instances.
        for (const platform of modes) {
            try {
                const globalTestKit = globalThis as Record<string, unknown>;
                if (platform === 'web') {
                    if (typeof globalTestKit.__RTL__ === 'undefined') {
                        // eslint-disable-next-line max-len
                        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                        globalTestKit.__RTL__ = require('@testing-library/react');
                    }
                    if (typeof globalTestKit.__USER_EVENT__ === 'undefined') {
                        // eslint-disable-next-line max-len
                        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                        globalTestKit.__USER_EVENT__ = require('@testing-library/user-event');
                    }
                } else {
                    if (typeof globalTestKit.__RNTL__ === 'undefined') {
                        // eslint-disable-next-line max-len
                        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                        globalTestKit.__RNTL__ = require('@testing-library/react-native');
                    }
                }
            } catch {
                // Best-effort bridge; ignore failures for unavailable platforms
            }
        }

        try {
            // For single-platform mode, instantiate the kit to ensure platform plugins initialize.
            if (modes.length === 1) {
                const isOnlyNative = modes.includes('native');
                if (isOnlyNative) {
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
            } else {
                // eslint-disable-next-line max-len
                // In dual mode, avoid picking one; mark boot and let tests construct kits explicitly
                bootState.__testKitBoot = true;
            }
        } catch {
            // Swallow; API interceptors are already installed
        }
        // If a kit instance was created above, register per-test date hooks now
        try {
            const maybeKit = bootState.__testKitBoot as unknown as {
                date?: { registerJestDateHooks?: () => void };
            };
            maybeKit?.date?.registerJestDateHooks?.();
        } catch {
            // best-effort; ignore if not available
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
