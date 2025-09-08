import React from 'react';
import { describe, test, expect } from '@jest/globals';
import { render } from '@testing-library/react';

import { createKit } from '../src';

describe('state plugin (web)', () => {
    test('getStore returns a persistent store instance', () => {
        const kit = createKit();
        const storeA = kit.state.getStore();
        const storeB = kit.state.getStore();
        expect(storeA).toBe(storeB);
    });

    test('store returns a new store per call', () => {
        const kit = createKit();
        const storeA = kit.state.store();
        const storeB = kit.state.store();
        expect(storeA).not.toBe(storeB);
    });

    test('renderWithStableStore uses the persistent store (window.store === getStore())', () => {
        const kit = createKit();
        const persistent = kit.state.getStore();

        const element = kit.state.renderWithStableStore(<div />);
        render(element);

        const win = window as unknown as { store?: unknown };
        expect(win.store).toBe(persistent);
    });

    test('renderWithState uses a fresh store distinct from getStore()', () => {
        const kit = createKit();
        const persistent = kit.state.getStore();

        const element = kit.state.renderWithState(<div />);
        render(element);

        const win = window as unknown as { store?: unknown };
        expect(win.store).not.toBe(persistent);
    });

    test('rerenderWithStableStore preserves the persistent store instance', () => {
        const kit = createKit();
        const element = kit.state.renderWithStableStore(
            <div data-testid="x" />
        );
        const { rerender } = render(element);

        const before = (window as unknown as { store?: unknown }).store;
        kit.state.rerenderWithStableStore(rerender, <div data-testid="y" />);
        const after = (window as unknown as { store?: unknown }).store;
        expect(after).toBe(before);
    });
});
