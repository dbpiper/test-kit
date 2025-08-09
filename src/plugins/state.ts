import type { MinimalStore } from "../redux/config";
import deepmerge from "deepmerge";
import React, {
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { Provider } from "react-redux";

import { definePlugin } from "../helpers/definePlugin";
import { getConfiguredRedux } from "../redux/config";

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export type StateHelpers<S> = {
  store: () => MinimalStore<S>;
  use: (preset: (state: S) => Partial<S> | void) => void;
  withPatch: (patch: Partial<S>) => void;
  withProviders: (providers: ComponentType<{ children?: ReactNode }>[]) => void;
  renderWithState: (component: ReactElement) => ReactElement;
  stubState: {
    <P extends string>(path: P, value: unknown): void;
    (patch: DeepPartial<S>): void;
  };
};

export const STATE_PLUGIN_KEY = Symbol.for("test-kit:state");

export type StatePresetOf<S> = (state: S) => Partial<S> | void;

export type StatePluginOptions<S> = {
  presets?: Array<StatePresetOf<S>>;
  patch?: Partial<S>;
  providers?: ComponentType<{ children?: ReactNode }>[];
};

export function statePlugin<S>(options?: StatePluginOptions<S>) {
  return definePlugin<"state", StateHelpers<S>>("state", {
    key: STATE_PLUGIN_KEY,
    setup() {
      const env = getConfiguredRedux<S>();
      if (!env) {
        throw new Error(
          "test-kit: Redux is not configured. Call configureRedux({ makeStore }) in your test setup."
        );
      }

      let patch: Partial<S> = options?.patch ?? {};
      const localPresets: Array<StatePresetOf<S>> = [
        ...(options?.presets ?? []),
      ];
      let extraProviders: ComponentType<{ children?: ReactNode }>[] = [
        ...(env.contextProviders ?? []),
        ...(options?.providers ?? []),
      ];

      const use = (preset: StatePresetOf<S>) => localPresets.push(preset);
      const withPatch = (patchUpdate: Partial<S>) => {
        patch = deepmerge(patch, patchUpdate);
      };
      const withProviders = (
        providers: ComponentType<{ children?: ReactNode }>[]
      ) => {
        extraProviders = extraProviders.concat(providers);
      };

      const stubState = (
        pathOrPatch: string | DeepPartial<S>,
        val?: unknown
      ) => {
        if (typeof pathOrPatch === "string") {
          const patchObj: Record<string, unknown> = {};
          (pathOrPatch as string).split(".").reduce((acc, key, idx, arr) => {
            if (idx === arr.length - 1) {
              acc[key] = val;
              return acc;
            }
            acc[key] = acc[key] ?? {};
            return acc[key] as Record<string, unknown>;
          }, patchObj);
          withPatch(patchObj as Partial<S>);
        } else {
          withPatch(pathOrPatch as Partial<S>);
        }
      };

      const buildPreloadedState = (): S => {
        const initial = env.makeStore().getState() as S;
        const presetPatch = localPresets.reduce((acc: Partial<S>, fn) => {
          const res = fn(initial);
          return res ? deepmerge(acc, res) : acc;
        }, {} as Partial<S>);
        return deepmerge(deepmerge(initial, presetPatch), patch) as S;
      };

      const store = () =>
        env.makeStore(buildPreloadedState()) as MinimalStore<S>;

      const renderWithState = (component: ReactElement) => {
        const storeInstance = store();

        const globalWithWindow = globalThis as unknown as {
          window?: Record<string, unknown>;
        };
        if (globalWithWindow.window) {
          (globalWithWindow.window as Record<string, unknown>).store =
            storeInstance as unknown as Record<string, unknown>;
        }

        let wrapped: ReactElement = React.createElement(
          Provider as unknown as ComponentType<{ store: unknown }>,
          { store: storeInstance as unknown },
          component
        );

        extraProviders.forEach((ProviderComponent) => {
          wrapped = React.createElement(
            ProviderComponent as ComponentType<{ children?: ReactNode }>,
            null,
            wrapped
          );
        });

        return wrapped;
      };

      return {
        store,
        use,
        withPatch,
        withProviders: withProviders as unknown as (
          providers: ComponentType<{ children?: ReactNode }>[]
        ) => void,
        renderWithState: renderWithState as unknown as (
          component: ReactElement
        ) => ReactElement,
        stubState: stubState as unknown as {
          <P extends string>(path: P, value: unknown): void;
          (patch: DeepPartial<S>): void;
        },
      } as StateHelpers<S>;
    },
  });
}
