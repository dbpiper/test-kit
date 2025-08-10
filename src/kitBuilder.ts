import type { AnyPlugin, KitContextFor, MergeNamespacedPlugins } from './types';
import { createKit } from './createKit';
import { defaultPlugins } from './defaultPlugins';

export function makeKitBuilder<B extends readonly AnyPlugin[]>(
    ...basePlugins: B
): <E extends readonly AnyPlugin[]>(
    ...extraPlugins: E
    // kitBuilder composes on top of web defaultPlugins
) => KitContextFor<'web'> &
    MergeNamespacedPlugins<[...typeof defaultPlugins, ...B, ...E]> {
    return (...extraPlugins) => createKit(...basePlugins, ...extraPlugins);
}
