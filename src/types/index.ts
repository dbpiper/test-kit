// Platform-agnostic Kit types. Avoid direct dependency on web or RN libs at call sites.
// Centralize library-specific types here so other modules can stay generic.

// Web types
export type WebScreen = typeof import('@testing-library/react').screen;
export type WebUser = import('@testing-library/user-event').UserEvent;

// React Native types
export type NativeScreen =
    typeof import('@testing-library/react-native').screen;
export type NativeUser = ReturnType<
    (typeof import('@testing-library/react-native'))['userEvent']['setup']
>;

export type Platform = 'web' | 'native';

export type ScreenFor<Plat extends Platform> = Plat extends 'web'
    ? WebScreen
    : NativeScreen;
export type UserFor<Plat extends Platform> = Plat extends 'web'
    ? WebUser
    : NativeUser;

export type Plugin<Name extends string, THelpers = unknown> = {
    key: symbol;
    name: Name;
    setup(ctx: KitContext): THelpers;
    teardown?(ctx: KitContext & THelpers): void;
};

export type KitContext<
    TScreen = WebScreen | NativeScreen,
    TUser = WebUser | NativeUser,
> = {
    screen: TScreen;
    user: TUser;
    add: (helpers: unknown) => void;
    get: (sym: symbol) => unknown;
    [pluginName: string]: unknown;
};

export type KitContextFor<Plat extends Platform> = KitContext<
    ScreenFor<Plat>,
    UserFor<Plat>
>;

export type AnyPlugin = Plugin<string, unknown>;

export type MergePlugins<T extends readonly AnyPlugin[]> = T extends readonly [
    infer First,
    ...infer Rest,
]
    ? First extends Plugin<string, infer U>
        ? Rest extends readonly AnyPlugin[]
            ? U & MergePlugins<Rest>
            : U
        : never
    : Record<string, never>;

export type MergeNamespacedPlugins<T extends readonly AnyPlugin[]> =
    T extends readonly [infer First, ...infer Rest]
        ? First extends Plugin<string, infer H>
            ? Rest extends readonly AnyPlugin[]
                ? Record<First['name'], H> & MergeNamespacedPlugins<Rest>
                : Record<First['name'], H>
            : Record<string, never>
        : Record<string, never>;
