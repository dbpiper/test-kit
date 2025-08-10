import type { UserEvent } from '@testing-library/user-event';

import { definePlugin } from '../helpers/definePlugin';

export type KeyboardHelpers = {
    keyboard: (seq: string) => Promise<void>;
};

export const keyboardPlugin = definePlugin<'keyboard', KeyboardHelpers>(
    'keyboard',
    {
        key: Symbol('keyboard'),
        setup(ctx) {
            const isWebUser = (candidate: unknown): candidate is UserEvent =>
                !!candidate &&
                typeof (candidate as { keyboard?: unknown }).keyboard ===
                    'function';
            return {
                keyboard: (seq: string) => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    return ctx.user.keyboard(seq);
                },
            };
        },
    }
);
