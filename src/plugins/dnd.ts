/* eslint-disable @typescript-eslint/no-require-imports */
// Avoid static import; resolve at runtime in web environments only

import { definePlugin } from '../helpers/definePlugin';

export type DndHelpers = {
    drop: (el: Element | null, data?: unknown) => void;
};

export const dndPlugin = definePlugin<'dnd', DndHelpers>('dnd', {
    key: Symbol('dnd'),
    setup() {
        const resolveFireEvent = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-underscore-dangle
            const rtl = (globalThis as any).__RTL__ as
                | typeof import('@testing-library/react')
                | undefined;
            if (rtl?.fireEvent) {
                return rtl.fireEvent;
            }
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const required =
                require('@testing-library/react') as typeof import('@testing-library/react');
            return required.fireEvent;
        };
        const drop = (el: Element | null, data: unknown = '') => {
            if (!(el instanceof HTMLElement)) {
                throw new Error('drop target missing');
            }
            const dt = {
                dataTransfer: { getData: () => data, types: ['text/plain'] },
            } as unknown as DragEvent;
            const fireEvent = resolveFireEvent();
            fireEvent.dragEnter(el, dt);
            fireEvent.dragOver(el, dt);
            fireEvent.drop(el, dt);
        };
        return { drop };
    },
});
