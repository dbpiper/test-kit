/* eslint-disable import/first */

import type { AnyPlugin, MergeNamespacedPlugins } from './types/core';
import type { NativeScreen, NativeUser } from './types/native';
import { defaultPluginsNative } from './defaultPlugins.native';

export function createKitNative(): import('./types/native').NativeKitContext &
    MergeNamespacedPlugins<[...typeof defaultPluginsNative]>;
export function createKitNative<const T extends readonly AnyPlugin[]>(
    ...extras: T
): import('./types/native').NativeKitContext &
    MergeNamespacedPlugins<[...typeof defaultPluginsNative, ...T]>;

export function createKitNative(
    pluginsOrFirst?: unknown,
    ...rest: unknown[]
): unknown {
    // Resolve React Native Testing Library at call time so any bridge
    // configured by setupTestKit is honored.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rntl: unknown =
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/no-explicit-any
        (globalThis as any).__RNTL__ ??
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@testing-library/react-native');

    const { screen, userEvent } = rntl as {
        screen: NativeScreen;
        userEvent: { setup: () => NativeUser };
    };

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
        ...defaultPluginsNative.filter(
            (plugin) => !explicitKeys.has(plugin.key)
        ),
        ...explicit,
    ];

    const rnUser: NativeUser = userEvent.setup();

    const ctx: import('./types/native').NativeKitContext = {
        screen,
        user: rnUser,
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
