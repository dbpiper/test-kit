import { type UserEvent } from '@testing-library/user-event';
import { act as rtlAct } from '@testing-library/react';
import { definePlugin } from '../helpers/definePlugin';

export type FlowHelpers = {
    // Execute the interaction immediately and flush updates. Prefer awaiting it.
    act: (fn: (u: UserEvent) => Promise<void>) => Promise<void>;
    // Back-compat: no-op flush for older tests that still call run().
    run: () => Promise<void>;
};

export const flowPlugin = definePlugin<'flow', FlowHelpers>('flow', {
    key: Symbol('flow'),
    setup(ctx) {
        return {
            act: async (fn: (u: UserEvent) => Promise<void>) => {
                // Wrap the interaction in React Testing Library's act
                await rtlAct(async () => {
                    await fn(ctx.user);
                });
                // Give component libs (e.g., MUI ripples) a microtask to settle
                await rtlAct(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
            },
            run: async () => {
                // Backward compatibility: provide a small flush for older tests
                await rtlAct(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
            },
        };
    },
});
