export function findClickableAncestorWeb(node: Element | null): Element | null {
    let current: Element | null = node;
    for (let i = 0; i < 50 && current; i += 1) {
        const el = current as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const hasRoleButton = el.getAttribute('role') === 'button';
        const isAnchorWithHref = tag === 'a' && el.hasAttribute('href');
        const hasInlineOnClick = el.hasAttribute('onclick');
        if (
            tag === 'button' ||
            hasRoleButton ||
            isAnchorWithHref ||
            hasInlineOnClick
        ) {
            return el;
        }
        current = el.parentElement;
    }
    throw new Error('test-kit: no web click target found');
}
