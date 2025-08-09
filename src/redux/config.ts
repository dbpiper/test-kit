import type { ComponentType, ReactNode } from 'react';

// Minimal, consumer-agnostic store/middleware shapes to avoid leaking Redux/RTK types
export type MinimalStore<S> = {
    getState: () => S;
    dispatch: (...args: unknown[]) => unknown;
    subscribe: (listener: () => void) => () => void;
};
export type MinimalMiddleware = unknown;

export type ReduxEnvironment<S> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeStore: (preloadedState?: any) => MinimalStore<S>;
    /** Optional extra context providers to wrap around the app */
    contextProviders?: ComponentType<{ children?: ReactNode }>[];
    /** Optional extra middlewares to append */
    middlewares?: MinimalMiddleware[];
};

declare global {
    // eslint-disable-next-line no-var
    var __TEST_KIT_REDUX_ENV__: ReduxEnvironment<unknown> | undefined;
}

export function configureRedux<S>(env: ReduxEnvironment<S>): void {
    // store in global so plugins can read it without importing app code
    // eslint-disable-next-line no-underscore-dangle
    (
        globalThis as unknown as {
            __TEST_KIT_REDUX_ENV__?: ReduxEnvironment<unknown>;
        }
    ).__TEST_KIT_REDUX_ENV__ = env as unknown as ReduxEnvironment<unknown>;
}

export function getConfiguredRedux<S>(): ReduxEnvironment<S> | undefined {
    // eslint-disable-next-line no-underscore-dangle
    return (
        globalThis as unknown as {
            __TEST_KIT_REDUX_ENV__?: ReduxEnvironment<unknown>;
        }
    ).__TEST_KIT_REDUX_ENV__ as ReduxEnvironment<S> | undefined;
}
