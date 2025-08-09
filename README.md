## test-kit

Typed, batteries-included testing kit for React Testing Library.

- **createKit(...plugins?)**: preconfigured with default plugins; pass extras to extend.
- **makeKitBuilder(...basePlugins)**: create your own default bundle.
- **definePlugin(name, { key, setup, teardown? })**: strongly-typed plugins.

Default plugins included:

- flow, api, interactions, keyboard, date, performance, dnd, page (generic)
- state (requires Redux config)
- router (via `routerPlugin` with a configured router environment)

Install peer deps:

```bash
npm i -D @testing-library/react @testing-library/user-event @reduxjs/toolkit react-redux
```

### Global setup in `jest.setup.ts`

Configure test-kit once for your test run. This example mirrors a Next.js app using Redux, Material UI, React Query, and `next-router-mock`.

```ts
// jest.setup.ts
/* eslint-disable */
import React from "react";
import { setupTestKit, NextRouterLike } from "test-kit";
import { configureStore } from "@reduxjs/toolkit";
import { ThemeProvider } from "@mui/material/styles";
import theme from "./theme";
import rootReducer from "./redux/rootReducer";
import { TestQueryClientProvider } from "./__tests__/helpers/testQueryClientWrapper";

// Make all next/router imports resolve to the in-memory mock
jest.mock("next/router", () => require("next-router-mock"));

setupTestKit({
  makeStore: (preloaded) =>
    configureStore({ reducer: rootReducer, preloadedState: preloaded }),
  contextProviders: [
    ({ children }) => React.createElement(ThemeProvider, { theme }, children),
    ({ children }) =>
      React.createElement(TestQueryClientProvider, null, children),
  ],
  router: {
    // Always return the single live module instance used by app/tests
    getRouter: (): NextRouterLike | undefined => {
      try {
        return require("next/router").default as NextRouterLike;
      } catch {
        return undefined;
      }
    },
  },
});
```

Notes

- Router configuration is required for `routerPlugin({ type: 'next' })`. If the router is not provided, the plugin will throw during setup.
- `setupTestKit` also wires your Redux store factory and any additional React providers used by your app so `statePlugin().renderWithState(...)` can wrap components.

### Creating a kit with router + state

```ts
import { makeKitBuilder, statePlugin, routerPlugin } from "test-kit";

// Optionally add your own page plugin here
export const createKit = makeKitBuilder(
  statePlugin(),
  routerPlugin({ type: "next", initialUrl: "/" })
);
```

### Rendering a component under providers

You can use your own test helper, or directly wrap via `statePlugin`:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { createKit, statePlugin } from "test-kit";
import { App } from "./App";

const kit = createKit(
  statePlugin({
    presets: [
      /* add optional state presets here */
    ],
  })
);

const ui = kit.state.renderWithState(<App />);
render(ui);

await waitFor(() => expect(screen.getByText("Calendar")).toBeInTheDocument());
```

### Example: Next.js navigation with `routerPlugin`

This resembles the pattern from a real test (e.g., `MonthView.test.tsx`):

```ts
import React from "react";
import { screen, waitFor } from "@testing-library/react";
import nextRouter from "next/router";
import { makeKitBuilder, statePlugin, routerPlugin } from "test-kit";
import { MonthView } from "@/features/calendar/components/views/MonthView";

const createMonthKit = makeKitBuilder(
  statePlugin(),
  routerPlugin({ type: "next", initialUrl: "/" })
);

it("selects a date and reflects it in the URL", async () => {
  // Optionally instrument the live router to capture calls
  const liveRouter = (await import("next/router")).default as typeof nextRouter;
  const calls: unknown[][] = [];
  const originalReplace = liveRouter.replace.bind(liveRouter);
  (liveRouter as any).replace = jest.fn(async (...args: unknown[]) => {
    calls.push(args);
    return originalReplace(...(args as [unknown, ...unknown[]]));
  });

  const kit = createMonthKit(
    statePlugin({
      presets: [
        /* app-specific state presets */
      ],
    })
  );

  const ui = kit.state.renderWithState(
    <MonthView locationId="1" addShiftMode={false} addBlockMode={false} />
  );
  const { user } = await import("@testing-library/user-event").then((m) => ({
    user: m.default.setup(),
  }));
  const { render } = await import("@testing-library/react");

  render(ui);

  // Interact
  const dayCell = await screen.findByRole("gridcell", {
    name: /January 15, 2024/i,
  });
  await user.click(dayCell);

  // Assert router state via the plugin (same instance as the app)
  await waitFor(() => {
    expect(kit.router.getLocation().path).toContain("date=2024-01-15");
  });

  // Optional: verify the captured replace arguments
  expect(calls.length).toBeGreaterThan(0);
});
```

What `routerPlugin({ type: 'next' })` does

- Reads the single router instance you provide via `setupTestKit({ router: { getRouter } })`.
- Wraps `push/replace` on that live instance to keep an internal snapshot in sync with route updates.
- `kit.router.getLocation()` returns `{ path, pathname, query }` based on the live router.

### API mocking

```ts
const kit = createKit();
kit.api.onGet("/users", { users: [] });
await fetch("/users");
await kit.api.expectCalledTimes("GET", "/users", 1);
```

### Keyboard helpers

```ts
await kit.keyboard("{Tab}{Enter}");
```

### Date control

```ts
import { datePlugin } from "test-kit";
const kit = createKit(datePlugin(new Date("2024-02-01T00:00:00Z")));
```

### Generic page wiring

```ts
import { pagePlugin } from "test-kit";
const createPage = ({ screen, user }: { screen: any; user: any }) => ({
  clickSave: async () => user.click(screen.getByText("Save")),
});
const kit = createKit(pagePlugin(createPage));
await kit.clickSave();
```

### State helpers (stubState)

```ts
import { createKit, statePlugin } from "test-kit";

const kit = createKit(statePlugin());

// Path-based
kit.state.stubState("auth.user.id", "1");

// Object-based
kit.state.stubState({ auth: { user: { id: "1" } } });

const ui = kit.state.renderWithState(<App />);
```
