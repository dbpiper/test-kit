import { fireEvent } from '@testing-library/react';

import { definePlugin } from '../helpers/definePlugin';

export type DndHelpers = {
    drop: (el: Element | null, data?: unknown) => void;
};

export const dndPlugin = definePlugin<'dnd', DndHelpers>('dnd', {
    key: Symbol('dnd'),
    setup() {
        const drop = (el: Element | null, data: unknown = '') => {
            if (!(el instanceof HTMLElement)) {
                throw new Error('drop target missing');
            }
            const dt = {
                dataTransfer: { getData: () => data, types: ['text/plain'] },
            } as unknown as DragEvent;
            fireEvent.dragEnter(el, dt);
            fireEvent.dragOver(el, dt);
            fireEvent.drop(el, dt);
        };
        return { drop };
    },
});
