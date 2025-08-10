import {
    screen as rnScreen,
    userEvent as rnUserEvent,
} from '@testing-library/react-native';

import { definePlugin } from '../helpers/definePlugin';

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
        const screen = rnScreen;
        const user = rnUserEvent.setup();
        return {
            async tapByText(text: string | RegExp) {
                const el = screen.getByText(text);
                await user.press(el as never);
            },
            async tapByTestId(testId: string) {
                const el = screen.getByTestId(testId);
                await user.press(el as never);
            },
            async typeText(testIdOrLabel: string | RegExp, text: string) {
                let input: unknown;
                try {
                    input = screen.getByLabelText(testIdOrLabel as string);
                } catch {
                    input = screen.getByTestId(testIdOrLabel as string);
                }
                await user.clear(input as never);
                await user.type(input as never, text);
            },
            async longPressByText(text: string | RegExp) {
                const el = screen.getByText(text);
                await user.longPress(el as never);
            },
            async longPressByTestId(testId: string) {
                const el = screen.getByTestId(testId);
                await user.longPress(el as never);
            },
        };
    },
});
