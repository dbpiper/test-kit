import { render, screen } from '@testing-library/react-native';

import React, { useState } from 'react';
import { Text, TextInput, Pressable, View } from 'react-native';

import { createKitNative } from '../src/index.native';

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
            <Pressable
                testID="target"
                onPress={() => setCount((currentCount) => currentCount + 1)}
            >
                <Text>Target Button</Text>
            </Pressable>
            <Text>{`count:${count}`}</Text>
            <Text>{`alt:${altCount}`}</Text>
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
