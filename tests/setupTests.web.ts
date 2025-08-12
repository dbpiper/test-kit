/* eslint-disable import/no-extraneous-dependencies */
import '@testing-library/jest-dom';
import React from 'react';

import { setupTestKit } from '../src';

// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-underscore-dangle
const __react = React;

type TestState = Record<string, unknown>;

setupTestKit<TestState>({
    makeStore(preloadedState?: TestState) {
        const state: TestState = preloadedState ?? {};
        const listeners = new Set<() => void>();
        return {
            getState: () => state,
            dispatch: (action: unknown) => action,
            subscribe: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        };
    },
    mode: 'web',
});
