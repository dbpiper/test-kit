// eslint-disable-next-line import/order
import { render } from '@testing-library/react-native';
import React from 'react';
import { View, Text } from 'react-native';

import { interactionsNativePlugin } from '../src/plugins/interactionsNative';

declare const global: Record<string, unknown>;

function makeFakeRntl(real: typeof import('@testing-library/react-native')) {
    const base = (...args: Parameters<typeof real.fireEvent>) =>
        // @ts-expect-error variadic
        real.fireEvent(...(args as unknown as []));
    const fakeFireEvent = Object.assign(base, {
        // Wrap selected helpers to assert they were used
        press: jest.fn(real.fireEvent.press),
        changeText: jest.fn(real.fireEvent.changeText),
    }) as unknown as typeof real.fireEvent;

    const fakeAct: typeof real.act = jest.fn(real.act);

    return {
        act: fakeAct,
        fireEvent: fakeFireEvent,
        screen: real.screen,
    } as Pick<typeof real, 'act' | 'fireEvent' | 'screen'>;
}

test('interactionsNative uses global __RNTL__ act and fireEvent when provided', async () => {
    const real =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@testing-library/react-native') as typeof import('@testing-library/react-native');
    const fake = makeFakeRntl(real);
    // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/no-explicit-any
    (global as any).__RNTL__ = fake;

    const helpers = interactionsNativePlugin.setup({} as never);

    render(
        <View>
            <Text onPress={() => undefined}>Go</Text>
        </View>
    );

    await helpers.tapByText('Go');

    expect(fake.act).toHaveBeenCalled();
    expect(fake.fireEvent.press).toHaveBeenCalled();

    // cleanup
    // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/no-explicit-any
    delete (global as any).__RNTL__;
});
