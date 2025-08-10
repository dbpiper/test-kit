// Native-only public types (no web imports here)

import type { KitContext as CoreKitContext } from './core';

export type NativeScreen =
    typeof import('@testing-library/react-native').screen;
export type NativeUser = ReturnType<
    (typeof import('@testing-library/react-native'))['userEvent']['setup']
>;

export type Platform = 'native';

export type NativeKitContext<
    TScreen = NativeScreen,
    TUser = NativeUser,
> = CoreKitContext<TScreen, TUser>;
