import { type UserEvent } from '@testing-library/user-event';

import { definePlugin } from '../helpers/definePlugin';

export type FlowHelpers = {
    // Execute the interaction immediately and flush updates. Prefer awaiting it.
    act: (fn: (user: UserEvent) => Promise<void>) => Promise<void>;
    // Back-compat: no-op flush for older tests that still call run().
    run: () => Promise<void>;
};

export const flowPlugin = definePlugin<'flow', FlowHelpers>('flow', {
    key: Symbol('flow'),
    setup(ctx) {
        const resolveRtl = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-underscore-dangle
            const maybe = (globalThis as any).__RTL__;
            if (maybe) {
                return maybe as typeof import('@testing-library/react');
            }
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('@testing-library/react') as typeof import('@testing-library/react');
        };
        const isWebUser = (candidate: unknown): candidate is UserEvent =>
            !!candidate &&
            typeof (candidate as { click?: unknown }).click === 'function' &&
            typeof (candidate as { keyboard?: unknown }).keyboard ===
                'function';
        return {
            act: async (fn: (user: UserEvent) => Promise<void>) => {
                // Wrap the interaction in React Testing Library's act
                await resolveRtl().act(async () => {
                    const candidateUser = ctx.user;
                    if (!isWebUser(candidateUser)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    await fn(candidateUser);
                });
                // Give component libs (e.g., MUI ripples) a microtask to settle
                await resolveRtl().act(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
            },
            run: async () => {
                // Backward compatibility: provide a small flush for older tests
                await resolveRtl().act(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
            },
        };
    },
});
