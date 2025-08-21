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

// Hook installation function - must be called outside of test execution
function installApiClearHooks(): void {
    const globalState = globalThis as unknown as {
        __testKitApi?: {
            calls: unknown[];
            abortedCalls: unknown[];
            mockRoutes: unknown[];
            nextRequestId: number;
            active: Set<number>;
            idleResolvers: Array<() => void>;
            hooksInstalled?: boolean;
        };
    };

    const shared = globalState.__testKitApi;
    if (!shared || shared.hooksInstalled) {
        return;
    }

    try {
        const ourThis = globalThis as unknown as {
            beforeEach?: (fn: () => void) => void;
        };

        const install = (fn: (cb: () => void) => void) => {
            try {
                fn(() => {
                    // Clear the shared state between tests
                    const currentShared = globalState.__testKitApi;
                    if (currentShared) {
                        currentShared.calls.length = 0;
                        currentShared.mockRoutes.length = 0;
                        currentShared.abortedCalls.length = 0;
                        currentShared.nextRequestId = 1;
                        if (currentShared.active.size > 0) {
                            currentShared.active.clear();
                            const resolvers =
                                currentShared.idleResolvers.splice(0);
                            resolvers.forEach((resolver: () => void) =>
                                resolver()
                            );
                        }
                    }
                });
                shared.hooksInstalled = true;
                return true;
            } catch {
                // If installing throws, skip silently
                return false;
            }
        };

        if (typeof ourThis.beforeEach === 'function') {
            install(ourThis.beforeEach);
        } else {
            // Fallback to explicit import for non-global jest envs
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const ourJest = require('@jest/globals');
                if (ourJest && typeof ourJest.beforeEach === 'function') {
                    install(ourJest.beforeEach);
                }
            } catch {
                /* ignore Jest import failure */
            }
        }
    } catch {
        /* ignore hook installation failure */
    }
}

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

        // Install Jest beforeEach hooks here, outside of test execution context
        // to avoid Jest's "hooks cannot be defined inside tests" restriction
        installApiClearHooks();

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
