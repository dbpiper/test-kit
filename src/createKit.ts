import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnyPlugin, KitContext, MergeNamespacedPlugins } from './types';
import { defaultPlugins } from './defaultPlugins';

// A single var-arg overload that always merges defaultPlugins first,
// then any extras, into a namespaced shape.
export function createKit<const T extends readonly AnyPlugin[]>(
    ...extras: T
): KitContext & MergeNamespacedPlugins<[...typeof defaultPlugins, ...T]>;

// implementation
export function createKit(
    pluginsOrFirst: unknown,
    ...rest: unknown[]
): unknown {
    const explicit: AnyPlugin[] = Array.isArray(pluginsOrFirst)
        ? (pluginsOrFirst as AnyPlugin[])
        : ([
              pluginsOrFirst as AnyPlugin,
              ...(rest as AnyPlugin[]),
          ] as AnyPlugin[]);

    const explicitKeys = new Set(explicit.map((p) => p.key));
    const all: AnyPlugin[] = [
        ...defaultPlugins.filter((p) => !explicitKeys.has(p.key)),
        ...explicit,
    ];

    const user =
        typeof (userEvent as unknown as { setup?: unknown }).setup ===
        'function'
            ? // v14+: userEvent.setup()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (userEvent as any).setup({ delay: null })
            : // v13 and earlier: userEvent is already a ready-to-use API object
              (userEvent as unknown as KitContext['user']);

    const ctx: KitContext = {
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
