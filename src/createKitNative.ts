import { screen, userEvent } from '@testing-library/react-native';

import type {
    AnyPlugin,
    KitContextFor,
    MergeNamespacedPlugins,
    NativeUser,
} from './types';
import { defaultPluginsNative } from './defaultPlugins.native';

export function createKitNative<const T extends readonly AnyPlugin[]>(
    ...extras: T
): KitContextFor<'native'> &
    MergeNamespacedPlugins<[...typeof defaultPluginsNative, ...T]>;

export function createKitNative(
    pluginsOrFirst: unknown,
    ...rest: unknown[]
): unknown {
    const explicit: AnyPlugin[] = Array.isArray(pluginsOrFirst)
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

    const ctx: KitContextFor<'native'> = {
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
