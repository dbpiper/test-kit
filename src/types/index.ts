import type { screen as rtlScreen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

export type Plugin<Name extends string, THelpers = unknown> = {
  key: symbol;
  name: Name;
  setup(ctx: KitContext): THelpers;
  teardown?(ctx: KitContext & THelpers): void;
};

export type KitContext = {
  screen: typeof rtlScreen;
  user: UserEvent;
  add: (helpers: unknown) => void;
  get: (sym: symbol) => unknown;
  [pluginName: string]: unknown;
};

export type AnyPlugin = Plugin<string, unknown>;

export type MergePlugins<T extends readonly AnyPlugin[]> = T extends readonly [
  infer First,
  ...infer Rest
]
  ? First extends Plugin<string, infer U>
    ? Rest extends readonly AnyPlugin[]
      ? U & MergePlugins<Rest>
      : U
    : never
  : {};

export type MergeNamespacedPlugins<T extends readonly AnyPlugin[]> =
  T extends readonly [infer First, ...infer Rest]
    ? First extends Plugin<string, infer H>
      ? Rest extends readonly AnyPlugin[]
        ? Record<First["name"], H> & MergeNamespacedPlugins<Rest>
        : Record<First["name"], H>
      : {}
    : {};
