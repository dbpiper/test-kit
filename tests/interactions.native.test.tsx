/* eslint-disable @typescript-eslint/no-require-imports */
import { render, screen } from '@testing-library/react-native';

import React, { useState } from 'react';
import {
    Text,
    TextInput,
    Pressable,
    TouchableOpacity,
    View,
} from 'react-native';

import { createKitNative } from '../src/index.native';
import { interactionsNativePlugin } from '../src/plugins/interactionsNative';

function ButtonSampleNative() {
    const [count, setCount] = useState(0);
    return (
        <View>
            <Text onPress={() => setCount((currentCount) => currentCount + 1)}>
                Press
            </Text>
            <Text testID="count">{`count:${count}`}</Text>
        </View>
    );
}

function ClickablesSampleNative() {
    const [count, setCount] = useState(0);
    const [altCount, setAltCount] = useState(0);
    return (
        <View>
            <Text
                accessibilityLabel="Accept"
                onPress={() =>
                    setAltCount((currentAltCount) => currentAltCount + 1)
                }
            >
                Click Me
            </Text>
            <TouchableOpacity
                testID="target"
                onPress={() => setCount((currentCount) => currentCount + 1)}
            >
                <Text>Target Button</Text>
            </TouchableOpacity>
            <Text>{`count:${count}`}</Text>
            <Text>{`alt:${altCount}`}</Text>
        </View>
    );
}

function NestedPressableSampleNative() {
    const [count, setCount] = useState(0);
    return (
        <View>
            <Pressable
                onPress={() => setCount((currentCount) => currentCount + 1)}
            >
                <View>
                    <Text>
                        <Text>Deep </Text>
                        <Text>Press</Text>
                    </Text>
                </View>
            </Pressable>
            <Text testID="nested-count">{`count:${count}`}</Text>
        </View>
    );
}

function InputsSampleNative() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [zip, setZip] = useState('');
    return (
        <View>
            <TextInput
                accessibilityLabel="Name"
                value={name}
                onChangeText={(text) => setName(text)}
            />
            <TextInput
                placeholder="Email"
                value={email}
                onChangeText={(text) => setEmail(text)}
            />
            <TextInput
                testID="zip-input"
                value={zip}
                onChangeText={(text) => setZip(text)}
            />
            <Text testID="name-value">{name}</Text>
            <Text testID="email-value">{email}</Text>
            <Text testID="zip-value">{zip}</Text>
        </View>
    );
}

function LongPressSampleNative() {
    const [longPressACount, setLongPressACount] = useState(0);
    const [longPressBCount, setLongPressBCount] = useState(0);
    return (
        <View>
            <Text
                onLongPress={() =>
                    setLongPressACount((currentValue) => currentValue + 1)
                }
            >
                Hold A
            </Text>
            <Pressable
                testID="lp"
                onLongPress={() =>
                    setLongPressBCount((currentValue) => currentValue + 1)
                }
            >
                <Text>Hold B</Text>
            </Pressable>
            <Text testID="a">{`a:${longPressACount}`}</Text>
            <Text testID="b">{`b:${longPressBCount}`}</Text>
        </View>
    );
}

test('native interactions plugin can tap by text', async () => {
    const kit = createKitNative();
    render(<ButtonSampleNative />);

    await kit.flow.act(async () => {
        await kit.interactions.tapByText('Press');
    });

    expect(screen.getByText('count:1')).toBeDefined();
});

test('tapByTestId works and pressing text increments altCount', async () => {
    const kit = createKitNative();
    render(<ClickablesSampleNative />);

    await kit.flow.act(async () => {
        await kit.interactions.tapByTestId('target');
        await kit.interactions.tapByText('Click Me');
    });

    expect(screen.getByText('count:1')).toBeDefined();
    expect(screen.getByText('alt:1')).toBeDefined();
});

test('tapByText walks up from nested Text to nearest Pressable', async () => {
    const kit = createKitNative();
    render(<NestedPressableSampleNative />);

    await kit.flow.act(async () => {
        await kit.interactions.tapByText('Press');
    });

    expect(screen.getByText('count:1')).toBeDefined();
});

test('typeText supports label, placeholder, and testID fallbacks', async () => {
    const kit = createKitNative();
    render(<InputsSampleNative />);

    await kit.flow.act(async () => {
        await kit.interactions.typeText('Name', 'Alice');
        await kit.interactions.typeText('Email', 'a@b.com');
        await kit.interactions.typeText('zip-input', '12345');
    });

    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('a@b.com')).toBeDefined();
    expect(screen.getByText('12345')).toBeDefined();
});

test('longPress helpers fire onLongPress by text and testID', async () => {
    const kit = createKitNative();
    render(<LongPressSampleNative />);

    await kit.flow.act(async () => {
        await kit.interactions.longPressByText?.('Hold A');
        await kit.interactions.longPressByTestId?.('lp');
    });

    expect(screen.getByText('a:1')).toBeDefined();
    expect(screen.getByText('b:1')).toBeDefined();
});

// Merged from interactionsNative.resolve.test.tsx
function makeFakeRntl(real: typeof import('@testing-library/react-native')) {
    const base = (
        ...args: Parameters<typeof real.fireEvent>
        // @ts-expect-error variadic passthrough
    ) => real.fireEvent(...(args as unknown as []));
    const fakeFireEvent = Object.assign(base, {
        press: jest.fn(real.fireEvent.press),
        changeText: jest.fn(real.fireEvent.changeText),
    }) as unknown as typeof real.fireEvent;

    // Wrap to preserve behavior and allow call assertions
    const fakeAct: typeof real.act = jest.fn(((cb: () => unknown) =>
        real.act(cb)) as typeof real.act);

    return Object.defineProperties(
        {
            act: fakeAct,
            fireEvent: fakeFireEvent,
        } as Partial<Pick<typeof real, 'act' | 'fireEvent' | 'screen'>>,
        {
            screen: {
                configurable: true,
                enumerable: true,
                get: () => real.screen,
            },
        }
    ) as Pick<typeof real, 'act' | 'fireEvent' | 'screen'>;
}

test('interactionsNative uses global __RNTL__ act and fireEvent when provided', async () => {
    // Use the module instance so screen getter reads the current export after render()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const real =
        require('@testing-library/react-native') as typeof import('@testing-library/react-native');
    const fake = makeFakeRntl(real);
    // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/no-explicit-any
    (global as any).__RNTL__ = fake;

    const helpers = interactionsNativePlugin.setup({} as never);

    // Render using the SAME module instance to initialize its internal screen
    real.render(
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
