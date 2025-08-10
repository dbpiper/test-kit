import type { screen as RtlScreen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

import { definePlugin } from '../helpers/definePlugin';

export type BaseDeps<TScreen = typeof RtlScreen, TUser = UserEvent> = {
    screen: TScreen;
    user: TUser;
};

export const pagePlugin = <
    THelpers,
    TScreen = typeof RtlScreen,
    TUser = UserEvent,
>(
    page: (deps: BaseDeps<TScreen, TUser>) => THelpers
) =>
    definePlugin<'page', THelpers>('page', {
        key: Symbol('page'),
        setup(ctx) {
            const helpers = page({
                screen: ctx.screen as TScreen,
                user: ctx.user as TUser,
            });
            ctx.add(helpers);
            return helpers;
        },
    });
