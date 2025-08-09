import { definePlugin } from "../helpers/definePlugin";

export type KeyboardHelpers = {
  keyboard: (seq: string) => Promise<void>;
};

export const keyboardPlugin = definePlugin<"keyboard", KeyboardHelpers>(
  "keyboard",
  {
    key: Symbol("keyboard"),
    setup(ctx) {
      return {
        keyboard: (seq: string) => ctx.user.keyboard(seq),
      };
    },
  }
);
