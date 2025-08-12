import { setupTestKit } from '../src';

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
    mode: 'native',
});
