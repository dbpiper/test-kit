import type { Plugin, KitContext } from '../types';

export function definePlugin<Name extends string, Helpers>(
    pluginName: Name,
    pluginConfig: Omit<Plugin<Name, Helpers>, 'name'> & {
        key: symbol;
        setup(ctx: KitContext): Helpers;
    },
): Plugin<Name, Helpers> & (() => Plugin<Name, Helpers>) {
    const { key, setup, teardown } = pluginConfig;
    const plugin: Plugin<Name, Helpers> = {
        key,
        name: pluginName,
        setup,
        teardown,
    };
    const factory = (() => plugin) as Plugin<Name, Helpers> &
        (() => Plugin<Name, Helpers>);

    const descriptors = Object.getOwnPropertyDescriptors(plugin);
    delete (descriptors as Record<string, unknown>).name;
    Object.defineProperties(factory, descriptors as PropertyDescriptorMap);

    Object.defineProperty(factory, 'name', {
        value: pluginName,
        configurable: true,
    });

    return factory;
}
