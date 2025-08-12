export function findPressTargetNative(node: unknown): unknown {
    // Walk up the React Test Instance tree to find a node with an onPress handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = node as any;
    for (let i = 0; i < 50 && current; i += 1) {
        if (typeof current?.props?.onPress === 'function') {
            return current;
        }
        current = current.parent;
    }
    return node;
}
