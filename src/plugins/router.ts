import { definePlugin } from '../helpers/definePlugin';
import { getConfiguredRouter } from '../router/config';

export type RouteLocation = {
    path: string;
    pathname?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query?: Record<string, any>;
};

export type RouteTo =
    | string
    | { pathname: string; query?: Record<string, unknown> };

export type RouterAdapter = {
    init?: () => void | Promise<void>;
    push: (to: RouteTo) => Promise<boolean | void> | boolean | void;
    replace: (to: RouteTo) => Promise<boolean | void> | boolean | void;
    getLocation: () => RouteLocation;
};

export type RouterHelpers = {
    navigate: (
        to: RouteTo,
        opts?: { replace?: boolean }
    ) => Promise<boolean | void>;
    replace: (to: RouteTo) => Promise<boolean | void>;
    getLocation: () => RouteLocation;
};

export function routerPlugin(
    adapter: RouterAdapter
): ReturnType<typeof definePlugin<'router', RouterHelpers>>;
export function routerPlugin(options: {
    type: 'next' | 'react-navigation';
    initialUrl?: string; // only used by 'next'
    // For react-navigation, tests should prefer passing a concrete adapter built
    // from a NavigationContainer ref. This options overload is for web only.
}): ReturnType<typeof definePlugin<'router', RouterHelpers>>;
export function routerPlugin(
    arg:
        | RouterAdapter
        | { type: 'next' | 'react-navigation'; initialUrl?: string }
) {
    const adapter: RouterAdapter =
        typeof (arg as { type: string }).type === 'string'
            ? // Build adapter for known types
              (() => {
                  const opts = arg as {
                      type: 'next' | 'react-navigation';
                      initialUrl?: string;
                  };
                  if (opts.type === 'next') {
                      // Require a router to be provided via setupTestKit({ router })
                      const env = getConfiguredRouter();
                      const nextRouter = env?.getRouter?.();
                      if (!nextRouter) {
                          throw new Error(
                              'test-kit: Router not configured. Call setupTestKit({ router: { getRouter } }) in your test setup.'
                          );
                      }
                      return createNextRouterAdapter(
                          nextRouter as NextRouterLike
                      );
                  }
                  if (opts.type === 'react-navigation') {
                      const env = getConfiguredRouter();
                      const nav = env?.getRouter?.();
                      if (!nav) {
                          throw new Error(
                              'test-kit: Router not configured. Provide a React Navigation router via setupTestKit({ router: { getRouter } }) or pass an adapter.'
                          );
                      }
                      return createReactNavigationAdapter(
                          nav as ReactNavigationLike
                      );
                  }
                  throw new Error(`Unsupported router type: ${opts.type}`);
              })()
            : (arg as RouterAdapter);

    return definePlugin<'router', RouterHelpers>('router', {
        key: Symbol('router'),
        setup() {
            adapter.init?.();
            const navigate = async (
                to: RouteTo,
                opts?: { replace?: boolean }
            ) => {
                if (opts?.replace) {
                    return adapter.replace(to) as Promise<boolean | void>;
                }
                return adapter.push(to) as Promise<boolean | void>;
            };
            return {
                navigate,
                replace: (to: RouteTo) =>
                    adapter.replace(to) as Promise<boolean | void>,
                getLocation: () => adapter.getLocation(),
            };
        },
    });
}

// Adapters

// Next.js adapter (works with next-router-mock or Next's useRouter() instance)
export type NextRouterLike = {
    push: (
        to: string | { pathname: string; query?: Record<string, unknown> }
    ) => Promise<boolean>;
    replace: (
        to: string | { pathname: string; query?: Record<string, unknown> }
    ) => Promise<boolean>;
    asPath: string;
    pathname: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: Record<string, any>;
};

export function createNextRouterAdapter(router: NextRouterLike): RouterAdapter {
    // Keep our own deterministic snapshot to avoid flakiness in mocks
    let currentPathname = router.pathname;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentQuery: Record<string, unknown> = (router as any).query ?? {};

    const parse = (
        to: string | { pathname: string; query?: Record<string, unknown> }
    ) =>
        typeof to === 'string'
            ? { pathname: to, query: {} as Record<string, unknown> }
            : { pathname: to.pathname, query: to.query ?? {} };

    const serializeQuery = (queryObject: Record<string, unknown>) => {
        const entries = Object.entries(queryObject);
        if (entries.length === 0) {
            return '';
        }
        const search = entries
            .map(
                ([key, value]) =>
                    `${encodeURIComponent(key)}=${encodeURIComponent(
                        String(value)
                    )}`
            )
            .join('&');
        return `?${search}`;
    };

    const getPathWithQuery = () =>
        `${currentPathname}${serializeQuery(currentQuery)}`;

    // Always resolve the live router via configured environment. No fallbacks.
    const resolveLiveRouter = () => {
        const env = getConfiguredRouter();
        const live = env?.getRouter?.();
        if (!live) {
            throw new Error(
                'test-kit: Router not configured. Call setupTestKit({ router: { getRouter } }) in your test setup.'
            );
        }
        return live;
    };

    return {
        init: () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const live = resolveLiveRouter() as any;

            // Sync our snapshot from live without mutating live router
            currentPathname = live.pathname ?? currentPathname;
            currentQuery = live.query ?? currentQuery;

            // Install wrappers on the live router so direct component calls update our snapshot too
            const originalPush = live.push?.bind(live);
            const originalReplace = live.replace?.bind(live);
            const wrapAndTrack =
                (
                    fn: (
                        to:
                            | string
                            | {
                                  pathname: string;
                                  query?: Record<string, unknown>;
                              },
                        // accept extra args (as, options) like Next router
                        ...rest: unknown[]
                    ) => Promise<boolean>
                ) =>
                async (
                    to:
                        | string
                        | { pathname: string; query?: Record<string, unknown> },
                    ...rest: unknown[]
                ) => {
                    const { pathname, query } = parse(to);
                    currentPathname = pathname;
                    currentQuery = query;
                    await Promise.resolve();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return fn(to as any, ...rest);
                };
            if (originalPush) {
                live.push = wrapAndTrack(originalPush);
            }
            if (originalReplace) {
                live.replace = wrapAndTrack(originalReplace);
            }
        },
        push: async (to) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const live = resolveLiveRouter() as any;
            await Promise.resolve();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return live.push(to as any);
        },
        replace: async (to) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const live = resolveLiveRouter() as any;
            await Promise.resolve();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return live.replace(to as any);
        },
        getLocation: () => {
            // Always read from the configured live router
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const live = resolveLiveRouter() as any;
            return {
                path: live.asPath ?? getPathWithQuery(),
                pathname: live.pathname ?? currentPathname,
                query: live.query ?? currentQuery,
            };
        },
    };
}

// React Navigation adapter (supports navigate/replace and current route)
export type ReactNavigationLike = {
    navigate: (name: string, params?: Record<string, unknown>) => unknown;
    reset?: (state: unknown) => unknown;
    dispatch?: (action: unknown) => unknown;
    replace?: (name: string, params?: Record<string, unknown>) => unknown;
    getCurrentRoute?: () =>
        | { name: string; params?: Record<string, unknown> }
        | undefined;
};

export function createReactNavigationAdapter(
    navigation: ReactNavigationLike,
    initialRoute?: { name: string; params?: Record<string, unknown> }
): RouterAdapter {
    return {
        init: () => {
            if (initialRoute) {
                if (navigation.replace) {
                    navigation.replace(initialRoute.name, initialRoute.params);
                } else {
                    navigation.navigate(initialRoute.name, initialRoute.params);
                }
            }
        },
        push: (to) => {
            if (typeof to === 'string') {
                navigation.navigate(to);
            } else {
                navigation.navigate(
                    to.pathname,
                    to.query as Record<string, unknown>
                );
            }
        },
        replace: (to) => {
            if (navigation.replace) {
                if (typeof to === 'string') {
                    navigation.replace(to);
                    return;
                }
                navigation.replace(
                    to.pathname,
                    to.query as Record<string, unknown>
                );
                return;
            }
            // fallback: navigate
            if (typeof to === 'string') {
                navigation.navigate(to);
                return;
            }
            navigation.navigate(
                to.pathname,
                to.query as Record<string, unknown>
            );
        },
        getLocation: () => {
            const route = navigation.getCurrentRoute?.();
            return {
                path: route?.name ?? '',
                pathname: route?.name,
                query: route?.params,
            };
        },
    };
}
