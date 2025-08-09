import { type UserEvent } from "@testing-library/user-event";
import { act } from "@testing-library/react";
import { definePlugin } from "../helpers/definePlugin";

export type FlowHelpers = {
  act: (fn: (u: UserEvent) => Promise<void>) => void;
  run: () => Promise<void>;
};

export const flowPlugin = definePlugin<"flow", FlowHelpers>("flow", {
  key: Symbol("flow"),
  setup(ctx) {
    const steps: ((u: UserEvent) => Promise<void>)[] = [];
    return {
      act: (fn: (u: UserEvent) => Promise<void>) => {
        steps.push(fn);
      },
      run: async () => {
        for (const func of steps) {
          // eslint-disable-next-line no-await-in-loop
          await func(ctx.user);
          // Flush pending effects/state updates that can be scheduled by
          // component libraries (e.g., ripple effects) after user interactions.
          // eslint-disable-next-line no-await-in-loop
          await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
          });
        }
      },
    };
  },
});
