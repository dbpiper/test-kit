import type { NativeScreen } from '../types';
import { definePlugin } from '../helpers/definePlugin';
import { findPressTargetNative } from './helpers/findPressTargetNative';

export type InteractionsNativeHelpers = {
    tapByText: (text: string | RegExp) => Promise<void>;
    tapByTestId: (testId: string) => Promise<void>;
    typeText: (testIdOrLabel: string | RegExp, text: string) => Promise<void>;
    longPressByText?: (text: string | RegExp) => Promise<void>;
    longPressByTestId?: (testId: string) => Promise<void>;
};

export const interactionsNativePlugin = definePlugin<
    'interactions',
    InteractionsNativeHelpers
>('interactions', {
    key: Symbol('interactions'),
    setup() {
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
        const resolveScreen = () => {
            const rntl =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-underscore-dangle
                (globalThis as any).__RNTL__ ??
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('@testing-library/react-native');
            return (rntl as { screen: NativeScreen }).screen;
        };
        const resolveRntl = () => {
            const rntl =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-underscore-dangle
                (globalThis as any).__RNTL__ ??
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('@testing-library/react-native');
            return rntl as typeof import('@testing-library/react-native');
        };

        return {
            async tapByText(text: string | RegExp) {
                const el = resolveScreen().getByText(text);
                const pressTarget = findPressTargetNative(el);
                const { fireEvent } = resolveRntl();
                await resolveAct()(async () => {
                    fireEvent.press(pressTarget as never);
                });
            },
            async tapByTestId(testId: string) {
                const el = resolveScreen().getByTestId(testId);
                const pressTarget = findPressTargetNative(el);
                const { fireEvent } = resolveRntl();
                await resolveAct()(async () => {
                    fireEvent.press(pressTarget as never);
                });
            },
            async typeText(testIdOrLabel: string | RegExp, text: string) {
                let input: unknown;
                try {
                    input = resolveScreen().getByLabelText(
                        testIdOrLabel as string
                    );
                } catch {
                    try {
                        input = resolveScreen().getByPlaceholderText(
                            testIdOrLabel as string
                        );
                    } catch {
                        input = resolveScreen().getByTestId(
                            testIdOrLabel as string
                        );
                    }
                }
                // For React Native, controlled inputs expect onChangeText to receive
                // the full value. Some userEvent implementations emit per-character
                // updates which set only the last character when the component does
                // `setValue(text)`. Use fireEvent.changeText with the complete string.
                const { fireEvent } = resolveRntl();
                await resolveAct()(async () => {
                    try {
                        fireEvent.changeText(input as never, '');
                    } catch {
                        // ignore if clearing fails
                    }
                    fireEvent.changeText(input as never, text as never);
                });
            },
            async longPressByText(text: string | RegExp) {
                const el = resolveScreen().getByText(text);
                const pressTarget = findPressTargetNative(el);
                const { fireEvent } = resolveRntl();
                await resolveAct()(async () => {
                    fireEvent(pressTarget as never, 'onLongPress');
                });
            },
            async longPressByTestId(testId: string) {
                const el = resolveScreen().getByTestId(testId);
                const pressTarget = findPressTargetNative(el);
                const { fireEvent } = resolveRntl();
                await resolveAct()(async () => {
                    fireEvent(pressTarget as never, 'onLongPress');
                });
            },
        };
    },
});
