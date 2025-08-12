export function findPressTargetNative(node: unknown): unknown {
    // Heuristics for React Test Instance that can handle a press
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const looksPressable = (inst: unknown): boolean => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const candidate: any = inst as any;
        if (!candidate || !candidate.props) {
            return false;
        }
        const propsRecord: Record<string, unknown> = candidate.props as Record<
            string,
            unknown
        >;
        const typeName: string = (() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const instType: any = candidate.type;
            return (instType?.displayName || instType?.name || '') as string;
        })();
        return (
            typeof (propsRecord as { onPress?: unknown }).onPress ===
                'function' ||
            typeof (propsRecord as { onLongPress?: unknown }).onLongPress ===
                'function' ||
            typeof (propsRecord as { onResponderRelease?: unknown })
                .onResponderRelease === 'function' ||
            typeof (propsRecord as { onStartShouldSetResponder?: unknown })
                .onStartShouldSetResponder === 'function' ||
            (propsRecord as { accessibilityRole?: unknown })
                .accessibilityRole === 'button' ||
            /Touchable|Pressable/i.test(typeName)
        );
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = node as any;
    // First, walk up to find nearest pressable ancestor
    for (let i = 0; i < 50 && current; i += 1) {
        if (looksPressable(current)) {
            return current;
        }
        current = current.parent;
    }

    // If no ancestor, try to find a pressable descendant within a bounded depth
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startNode: any = node as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stack: any[] = Array.isArray(startNode?.children)
        ? [...startNode.children]
        : [];
    let depth = 0;
    const MAX_NODES = 200;
    while (stack.length && depth < MAX_NODES) {
        depth += 1;
        const next = stack.shift();
        if (!next) {
            // eslint-disable-next-line no-continue
            continue;
        }
        if (looksPressable(next)) {
            return next;
        }
        if (Array.isArray(next.children)) {
            stack.push(...next.children);
        }
    }

    throw new Error('test-kit: no native press target found');
}
