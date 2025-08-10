import { act as rtlAct } from '@testing-library/react-native';

import { definePlugin } from '../helpers/definePlugin';
import type { NativeUser } from '../types';

export type FlowHelpers = {
    act: (fn: (u: NativeUser) => Promise<void>) => Promise<void>;
    run: () => Promise<void>;
};

export const flowNativePlugin = definePlugin<'flow', FlowHelpers>('flow', {
    key: Symbol('flow'),
    setup(ctx) {
        const isNativeUser = (candidate: unknown): candidate is NativeUser =>
            !!candidate &&
            typeof (candidate as { press?: unknown }).press === 'function';
        return {
            act: async (fn: (u: NativeUser) => Promise<void>) => {
                await rtlAct(async () => {
                    const candidateUser = ctx.user;
                    if (!isNativeUser(candidateUser)) {
                        throw new Error(
                            'test-kit: expected React Native userEvent instance'
                        );
                    }
                    await fn(candidateUser);
                });
                await rtlAct(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
            },
            run: async () => {
                await rtlAct(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
            },
        };
    },
});
