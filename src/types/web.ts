// Web-only public types (no React Native imports here)

import type { KitContext as CoreKitContext } from './core';

export type WebScreen = typeof import('@testing-library/react').screen;
export type WebUser = import('@testing-library/user-event').UserEvent;

export type Platform = 'web';

export type WebKitContext<
    TScreen = WebScreen,
    TUser = WebUser,
> = CoreKitContext<TScreen, TUser>;
