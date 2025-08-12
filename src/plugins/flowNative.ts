import { definePlugin } from '../helpers/definePlugin';
import type { NativeUser } from '../types';

export type FlowHelpers = {
    act: (fn: (user: NativeUser) => Promise<void>) => Promise<void>;
    run: () => Promise<void>;
};

export const flowNativePlugin = definePlugin<'flow', FlowHelpers>('flow', {
    key: Symbol('flow'),
    setup(ctx) {
        const isNativeUser = (candidate: unknown): candidate is NativeUser =>
            !!candidate &&
            typeof (candidate as { press?: unknown }).press === 'function';
        const resolveAct = () => {
            const rntl =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-underscore-dangle
                (globalThis as any).__RNTL__ ??
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('@testing-library/react-native');
            return (
                rntl as {
                    act: typeof import('@testing-library/react-native').act;
                }
            ).act;
        };
        return {
            act: async (fn: (user: NativeUser) => Promise<void>) => {
                await resolveAct()(async () => {
                    const candidateUser = ctx.user;
                    if (!isNativeUser(candidateUser)) {
                        throw new Error(
                            'test-kit: expected React Native userEvent instance'
                        );
                    }
                    await fn(candidateUser);
                });
                await resolveAct()(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
            },
            run: async () => {
                await resolveAct()(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
            },
        };
    },
});
