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
    page: (deps: BaseDeps<TScreen, TUser>) => THelpers,
) =>
    definePlugin<'page', THelpers>('page', {
        key: Symbol('page'),
        setup(ctx) {
            const helpers = page({
                screen: ctx.screen as unknown as TScreen,
                user: ctx.user as unknown as TUser,
            });
            ctx.add(helpers);
            return helpers;
        },
    });
