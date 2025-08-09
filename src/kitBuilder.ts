import type { AnyPlugin, KitContext, MergeNamespacedPlugins } from "./types";
import { createKit } from "./createKit";
import { defaultPlugins } from "./defaultPlugins";

export function makeKitBuilder<B extends readonly AnyPlugin[]>(
  ...basePlugins: B
): <E extends readonly AnyPlugin[]>(
  ...extraPlugins: E
) => KitContext &
  MergeNamespacedPlugins<[...typeof defaultPlugins, ...B, ...E]> {
  return (...extraPlugins) => createKit(...basePlugins, ...extraPlugins);
}
