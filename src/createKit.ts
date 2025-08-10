import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
