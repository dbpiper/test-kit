import { findPressTargetNative } from '../src/plugins/helpers/findPressTargetNative';

type TestInst = {
    props?: Record<string, unknown>;
    children?: TestInst[] | Array<TestInst | null | undefined>;
    parent?: TestInst | null;
    type?: { name?: string; displayName?: string } | string;
};

function linkParents(
    node: TestInst | null,
    parent: TestInst | null = null
): void {
    if (!node) {
        return;
    }
    // eslint-disable-next-line no-param-reassign
    node.parent = parent ?? null;
    const kids = Array.isArray(node.children) ? node.children : [];
    for (const child of kids as Array<TestInst | null | undefined>) {
        linkParents(child ?? null, node);
    }
}

test('findPressTargetNative descends into children and skips nulls', () => {
    const pressable: TestInst = {
        props: { onPress: () => {} },
        children: [],
        type: { name: 'TouchableOpacity' },
    };
    const containerChild: TestInst = {
        props: {},
        children: [pressable],
        type: { name: 'View' },
    };
    const root: TestInst = {
        props: {},
        // Include a null to exercise the `continue` branch and push of grandchildren
        children: [null, containerChild],
        type: { name: 'View' },
    };
    linkParents(root, null);

    const target = findPressTargetNative(root) as TestInst;
    expect(target).toBe(pressable);
});

test('findPressTargetNative throws when no pressable found', () => {
    const root: TestInst = {
        props: {},
        children: [{ props: {}, children: [], type: { name: 'View' } }],
        type: { name: 'View' },
    };
    linkParents(root, null);
    expect(() => findPressTargetNative(root)).toThrow(
        'test-kit: no native press target found'
    );
});
