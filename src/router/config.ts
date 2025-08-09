import type { NextRouterLike } from "../plugins/router";

export type RouterEnvironment = {
  getRouter: () => NextRouterLike | undefined;
};

declare global {
  // eslint-disable-next-line no-var
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
