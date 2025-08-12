export function findClickableAncestorWeb(node: Element | null): Element | null {
    let current: Element | null = node;
    for (let i = 0; i < 50 && current; i += 1) {
        const el = current as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const hasRoleButton = el.getAttribute('role') === 'button';
        const hasOnClick =
            typeof (el as unknown as { onclick?: unknown }).onclick ===
            'function';
        if (tag === 'button' || hasRoleButton || hasOnClick) {
            return el;
        }
        current = el.parentElement;
    }
    return node;
}
