/* eslint-disable import/first */

import type { AnyPlugin, MergeNamespacedPlugins } from './types/core';
import type { WebUser } from './types/web';
import { defaultPlugins } from './defaultPlugins';

// Overloads: zero-arg uses only defaultPlugins; var-arg merges extras after defaults
export function createKit(): import('./types/web').WebKitContext &
    MergeNamespacedPlugins<[...typeof defaultPlugins]>;
export function createKit<const T extends readonly AnyPlugin[]>(
    ...extras: T
): import('./types/web').WebKitContext &
    MergeNamespacedPlugins<[...typeof defaultPlugins, ...T]>;

// implementation
export function createKit(
    pluginsOrFirst?: unknown,
    ...rest: unknown[]
): unknown {
    // Resolve web Testing Library instances at call time so any bridge
    // configured by setupTestKit is honored.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webTl: any =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-underscore-dangle
        (globalThis as any).__RTL__ ??
        // eslint-disable-next-line max-len
        // eslint-disable-next-line import/no-commonjs, @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        require('@testing-library/react');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userEventModule: any =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-underscore-dangle
        (globalThis as any).__USER_EVENT__ ??
        // eslint-disable-next-line max-len
        // eslint-disable-next-line import/no-commonjs, @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        require('@testing-library/user-event');

    const { screen } = webTl;
    const userEvent = userEventModule.default ?? userEventModule;

    const explicit: AnyPlugin[] =
        pluginsOrFirst === undefined
            ? []
            : Array.isArray(pluginsOrFirst)
              ? (pluginsOrFirst as AnyPlugin[])
              : ([
                    pluginsOrFirst as AnyPlugin,
                    ...(rest as AnyPlugin[]),
                ] as AnyPlugin[]);

    const explicitKeys = new Set(explicit.map((plugin) => plugin.key));
    const all: AnyPlugin[] = [
        ...defaultPlugins.filter((plugin) => !explicitKeys.has(plugin.key)),
        ...explicit,
    ];

    const user: WebUser =
        typeof (userEvent as unknown as { setup?: unknown }).setup ===
        'function'
            ? // v14+: userEvent.setup()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((userEvent as any).setup({ delay: null }) as WebUser)
            : // v13 and earlier: userEvent is already a ready-to-use API object
              (userEvent as unknown as WebUser);

    const ctx: import('./types/web').WebKitContext = {
        screen,
        user,
        add(helpers: unknown) {
            Object.assign(ctx as Record<string, unknown>, helpers);
        },
        get(sym: symbol) {
            return (ctx as Record<string, unknown>)[sym.description as string];
        },
    };

    for (const plugin of all) {
        const helpers = plugin.setup(ctx);
        if (helpers !== undefined) {
            (ctx as Record<string, unknown>)[plugin.name] = helpers;
        }
    }

    return ctx;
}
