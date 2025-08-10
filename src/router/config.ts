import type { NextRouterLike, ReactNavigationLike } from '../plugins/router';

export type RouterEnvironment = {
    // Return a router instance for the active platform.
    // For web (Next), this should be a NextRouter-like object.
    // For React Native, this should be a ReactNavigation-like object.
    getRouter: () => NextRouterLike | ReactNavigationLike | undefined;
};

declare global {
    // eslint-disable-next-line no-var, @typescript-eslint/naming-convention
    var __TEST_KIT_ROUTER_ENV__: RouterEnvironment | undefined;
}

export function configureRouter(env: RouterEnvironment): void {
    (
        globalThis as unknown as { __TEST_KIT_ROUTER_ENV__?: RouterEnvironment }
    ).__TEST_KIT_ROUTER_ENV__ = env;
}

export function getConfiguredRouter(): RouterEnvironment | undefined {
    return (
        globalThis as unknown as { __TEST_KIT_ROUTER_ENV__?: RouterEnvironment }
    ).__TEST_KIT_ROUTER_ENV__;
}
