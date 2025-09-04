# @suerg/test-kit

Typed, batteries-included helpers for building stable, readable integration tests with React Testing Library on both React (web) and React Native.

- Purpose: provide a small, strongly-typed “kit” you compose once per test that bundles common test ergonomics: Redux state setup, API mocking, interactions, router control, time control, and more.
- Design: plugin-based. Add only what you need; bring your own app providers via global setup.

Default plugins included when you create a kit:

- flow, api, interactions, keyboard, date, performance, dnd, page (web)
- flow, api, interactions, date, performance (native)
- state (web and native; requires a Redux store factory via global setup)
- router is available via `routerPlugin(...)` when a router environment is configured

## Install

React (web):

```bash
npm i -D @suerg/test-kit @testing-library/react @testing-library/user-event @reduxjs/toolkit react-redux react-dom
# Optional but common in web apps
npm i -D @testing-library/jest-dom
```

React Native:

```bash
npm i -D @suerg/test-kit @testing-library/react-native @reduxjs/toolkit react-redux react-dom
```

If you intend to use the router plugin on web with Next.js, also ensure a single router instance is available to tests (e.g., `next-router-mock` or Next’s `useRouter()` module instance).

## Global setup (one-time)

Provide your Redux store factory and any app-wide providers. Optionally provide a router getter.

React (example):

```ts
// jest.setup.ts
/* eslint-disable */
import React from 'react';
import { setupTestKit, NextRouterLike } from '@suerg/test-kit';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from '@mui/material/styles';
import rootReducer from '@/redux/rootReducer';
import { TestQueryClientProvider } from './__tests__/helpers/testQueryClientWrapper';
import theme from './theme';

setupTestKit({
    makeStore: (preloaded) =>
        configureStore({ reducer: rootReducer, preloadedState: preloaded }),
    contextProviders: [
        ({ children }) =>
            React.createElement(ThemeProvider, { theme }, children),
        ({ children }) =>
            React.createElement(TestQueryClientProvider, null, children),
    ],
    router: {
        getRouter: (): NextRouterLike | undefined => {
            try {
                return require('next/router').default as NextRouterLike;
            } catch {
                return undefined;
            }
        },
    },
});
```

React Native (example):

```ts
// jest.setup.(ts|js)
/* eslint-disable */
import React from 'react';
import { setupTestKit } from '@suerg/test-kit';
import { Provider as PaperProvider } from 'react-native-paper';
import {
    SafeAreaProvider,
    initialWindowMetrics,
} from 'react-native-safe-area-context';
import { makeStore } from '@/src/store/store';
import { theme } from '@/src/constants/theme';

setupTestKit({
    makeStore: (preloaded) => makeStore(preloaded),
    contextProviders: [
        ({ children }) =>
            React.createElement(PaperProvider, { theme }, children),
        ({ children }) =>
            React.createElement(
                SafeAreaProvider,
                { initialMetrics: initialWindowMetrics },
                children
            ),
    ],
});
```

Notes

- The `statePlugin()` uses your `makeStore(preloaded)` and wraps the UI under `react-redux`’s `Provider` plus any `contextProviders` you pass above.
- For web Next.js routing, `routerPlugin({ type: 'next' })` requires `setupTestKit({ router: { getRouter } })` to return the single live router instance used by tests and app.

React Native router setup (React Navigation):

```ts
// jest.setup.(ts|js)
/* eslint-disable */
import { setupTestKit } from '@suerg/test-kit';
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

setupTestKit({
    makeStore: (preloaded) => makeStore(preloaded),
    router: {
        getRouter: () => navigationRef.current,
    },
});
```

In tests, render your navigator with the same ref and use the router plugin:

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from '../jest.setup';

const kit = createKitNative(routerPlugin({ type: 'react-navigation' }));
render(
    kit.state.renderWithState(
        <NavigationContainer ref={navigationRef}>
            <AppNavigator />
        </NavigationContainer>
    )
);

await kit.router.navigate('Details', { id: '1' });
```

## Creating a kit

Web:

```ts
import {
    createKit,
    makeKitBuilder,
    statePlugin,
    routerPlugin,
    pagePlugin,
} from '@suerg/test-kit';

// One-off kit
const kit = createKit(statePlugin(), routerPlugin({ type: 'next' }));

// Reusable builder with defaults
export const makeAppKit = makeKitBuilder(
    statePlugin(),
    routerPlugin({ type: 'next' })
);
const appKit = makeAppKit(
    pagePlugin(({ screen, user }) => ({
        clickSave: () => user.click(screen.getByText('Save')),
    }))
);
```

React Native:

```ts
import { createKitNative, statePlugin } from '@suerg/test-kit';

const kit = createKitNative(statePlugin());
```

## Rendering and interacting (integration test examples)

Web (Next.js style):

```ts
import { render, screen, waitFor } from '@testing-library/react';
import { makeKitBuilder, statePlugin, routerPlugin } from '@suerg/test-kit';
import { MonthView } from '@/features/calendar/components/views/MonthView';

const makeMonthKit = makeKitBuilder(statePlugin(), routerPlugin({ type: 'next' }));
const kit = makeMonthKit();

render(kit.state.renderWithState(<MonthView locationId="1" addShiftMode={false} addBlockMode={false} />));

await kit.flow.act(async (user) => {
  await user.click(await screen.findByRole('gridcell', { name: /January 15, 2024/i }));
});

await waitFor(() => expect(kit.router.getLocation().path).toContain('date=2024-01-15'));
```

React Native (React Navigation style):

```ts
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { createKitNative, statePlugin } from '@suerg/test-kit';
import RootStackNavigator from '@/src/navigation/RootStackNavigator';

const kit = createKitNative(statePlugin());
render(kit.state.renderWithState(<RootStackNavigator />));

await kit.flow.act(async (user) => {
  await user.press(await screen.findByText('Save'));
});

await waitFor(() => expect(screen.getByText('Login')).toBeDefined());
```

If your component relies on selector-driven effects and you need to rerender while preserving the same Redux store, use the stable-store helpers:

```tsx
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { createKitNative, statePlugin } from '@suerg/test-kit';

const kit = createKitNative(statePlugin());
const ui = <RootStackNavigator />;
const { rerender } = render(kit.state.renderWithStableStore(ui));

// flip a flag in state and rerender without recreating the store
await act(async () => {
    kit.state.rerenderWithStableStore(rerender, ui);
});
```

## API Plugin (HTTP mocking)

Available as part of defaults (web and native):

- onGet/onPost/onPut/onPatch/onDelete(path, body, status = 200, repeat = 1)
- onGetHang(path)
- chaos: rateLimit(path), serverError(path), timeout(path), networkError(path)
- getCalls(method?, path?) -> ApiCallRecord[]
- expectCalledTimes(method, path, times)
- expectAbortedTimes(method, path, times)
- waitForIdle(), expectNoPending(), clear()
- getAbortedCalls()

### Debug logging

- Pass a boolean to enable logs programmatically: `apiPlugin({ debug: true })`.
- Or set the environment variable to a boolean string: `TEST_KIT_API_DEBUG=true`.

Example:

```bash
cross-env TEST_KIT_API_DEBUG=true npm test
```

Example:

```ts
kit.api.onGet('/api/users', { users: [] }, 200);
await fetch('/api/users');
await kit.api.expectCalledTimes('GET', '/api/users', 1);
await kit.api.expectNoPending();
```

PATCH example:

```ts
kit.api.onPatch('/api/items/1', { ok: true }, 200);
await fetch('/api/items/1', { method: 'PATCH' });
await kit.api.expectCalledTimes('PATCH', '/api/items/1', 1);
```

## State Plugin (Redux)

Helpers:

- store(): returns the configured store instance created with current presets/patch
- use(preset): register a function that derives a state patch from the initial state
- withPatch(patch): merge-in static preloaded state
- withProviders(providers): add more wrapper providers for this kit
- renderWithState(ui): wraps `ui` with `Provider` and extra providers
- renderWithStableStore(ui): like renderWithState, but keeps a single persistent store across rerenders
- rerenderWithStableStore(rerender, ui): convenience to rerender with the same persistent store
- stubState(path, value) or stubState({ nested: patches })

Example:

```ts
const kit = createKit(statePlugin());
kit.state.stubState('auth.user.id', '1');
render(kit.state.renderWithState(<App />));
```

## Flow Plugin

- act(async (user) => { `/* interactions */` }): wraps in RTL `act()` and flushes microtasks

## Interactions Plugins

Web (`interactionsPlugin`):

- clickCell(label)
- clickButton(label)
- clickByText(text)
- clickByTestId(testId)
- typeText(labelOrTestId, text)
- selectViaKb(label)
- hoverElement(label)
- hoverText(text)
- clearSelections()
- expectSelected(label)
- expectNotSelected(label)

React Native (`interactionsNativePlugin`):

- tapByText(text)
- tapByTestId(testId)
- typeText(testIdOrLabel, text)
- longPressByText(text)
- longPressByTestId(testId)

## Keyboard Plugin (web)

- keyboard(seq: string): delegates to userEvent.keyboard

```ts
await kit.keyboard('{Tab}{Enter}');
```

## DnD Plugin (web)

- drop(element, data?): fires dragEnter/dragOver/drop with simple dataTransfer

## Performance Plugin

- shouldCompleteWithin(ms)
- shouldRenderWithin(ms)
- shouldUpdateWithin(ms)
- shouldInteractWithin(ms)
- run(testFn)

```ts
kit.performance.shouldRenderWithin(25);
await kit.performance.run(async () => {
  render(kit.state.renderWithState(<App />));
});
```

## Date Plugin

Freezes `Date` to a fixed moment without switching to fake timers. Useful when you prefer real timers but deterministic time.

```ts
import { datePlugin } from '@suerg/test-kit';
const kit = createKit(datePlugin(new Date('2024-02-01T00:00:00Z')));
```

## Router Plugin

Use with a configured environment via `setupTestKit({ router: { getRouter } })`.

Web (Next.js):

```ts
import { routerPlugin } from '@suerg/test-kit';
const kit = createKit(routerPlugin({ type: 'next' }));
kit.router.getLocation();
await kit.router.navigate({ pathname: '/users', query: { q: 'joe' } });
```

React Native (React Navigation):

Two options:

1. Use a configured router environment (preferred):

```ts
import { routerPlugin } from '@suerg/test-kit';
const kit = createKitNative(routerPlugin({ type: 'react-navigation' }));
await kit.router.navigate('Details', { id: '1' });
```

1. Or pass an explicit adapter built from a `NavigationContainer` ref:

```ts
import { routerPlugin, createReactNavigationAdapter } from '@suerg/test-kit';
const adapter = createReactNavigationAdapter(navigationRef.current);
const kit = createKitNative(routerPlugin(adapter));
await kit.router.navigate('Details', { id: '1' });
```

## Typing your Redux RootState (recommended)

Augment the module so helpers are typed against your real `RootState`.

```ts
// types/test-kit.d.ts
import type rootReducer from '@/redux/rootReducer';
export type RootState = ReturnType<typeof rootReducer>;
declare module '@suerg/test-kit' {
    interface TestKitReduxState extends RootState {}
}
```

## Writing integration tests

- Use `statePlugin().renderWithState(ui)` to render your real component under real providers.
- Drive user behavior via `kit.flow.act` and interactions helpers instead of manual `act()` and timers.
- Mock APIs with `kit.api` instead of ad-hoc jest mocks; assert calls with `expectCalledTimes`.
- For router-aware components, prefer `routerPlugin` and assert via `kit.router.getLocation()`.
