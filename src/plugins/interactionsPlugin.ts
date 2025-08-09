import { screen, act } from '@testing-library/react';
import type { KitContext } from '../types';
import { definePlugin } from '../helpers/definePlugin';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const expect: any;

export type InteractionsHelpers = {
    clickCell: (label: string | RegExp) => Promise<void>;
    clickButton: (label: string | RegExp) => Promise<void>;
    clickByText: (text: string | RegExp) => Promise<void>;
    clickByTestId: (testId: string) => Promise<void>;
    typeText: (labelOrTestId: string | RegExp, text: string) => Promise<void>;
    selectViaKb: (label: string | RegExp) => Promise<void>;
    hoverElement: (label: string | RegExp) => Promise<void>;
    hoverText: (text: string | RegExp) => Promise<void>;
    clearSelections: () => Promise<void>;
    expectSelected: (label: string | RegExp) => Promise<void>;
    expectNotSelected: (label: string | RegExp) => Promise<void>;
};

export const interactionsPlugin = definePlugin<
    'interactions',
    InteractionsHelpers
>('interactions', {
    key: Symbol('interactions'),
    setup(ctx: KitContext) {
        const maybeGetContainer = (ctx as Record<string, unknown>)
            .getContainer as (() => HTMLElement) | undefined;
        const getContainer = maybeGetContainer ?? (() => document.body);

        const maybeGetCell = (ctx as Record<string, unknown>).getCell as
            | ((label: string | RegExp) => HTMLElement)
            | undefined;
        const getCell =
            maybeGetCell ??
            ((label) =>
                (ctx.screen as typeof screen).getByRole('gridcell', {
                    name: label,
                }));

        return {
            async clickCell(label: string | RegExp) {
                const el = (ctx.screen as typeof screen).getByRole('gridcell', {
                    name: label,
                });
                await act(async () => {
                    await ctx.user.click(el);
                });
            },
            async clickButton(label: string | RegExp) {
                let btn: HTMLElement;
                try {
                    btn = (ctx.screen as typeof screen).getByRole('button', {
                        name: label,
                    });
                } catch {
                    btn = (ctx.screen as typeof screen).getByText(label, {
                        selector: 'button, [role="button"]',
                    });
                }
                await act(async () => {
                    await ctx.user.click(btn);
                });
            },
            async clickByText(text: string | RegExp) {
                const el = (ctx.screen as typeof screen).getByText(text);
                await act(async () => {
                    await ctx.user.click(el);
                });
            },
            async clickByTestId(testId: string) {
                const el = (ctx.screen as typeof screen).getByTestId(testId);
                await act(async () => {
                    await ctx.user.click(el);
                });
            },
            async typeText(labelOrTestId: string | RegExp, text: string) {
                let input: HTMLElement;
                try {
                    input = await (ctx.screen as typeof screen).findByLabelText(
                        labelOrTestId as string
                    );
                } catch {
                    input = (ctx.screen as typeof screen).getByTestId(
                        labelOrTestId as string
                    );
                }
                await act(async () => {
                    await ctx.user.clear(input);
                    await ctx.user.type(input, text);
                });
            },
            async selectViaKb(label: string | RegExp) {
                await act(async () => {
                    while (document.activeElement !== getContainer()) {
                        await ctx.user.tab();
                    }
                    for (let i = 0; i < 100; i++) {
                        const active = document.activeElement as HTMLElement;
                        if (active.getAttribute('aria-label')?.match(label)) {
                            await ctx.user.keyboard('{Enter}');
                            return;
                        }
                        await ctx.user.keyboard('{ArrowRight}');
                    }
                    throw new Error(`could not focus via keyboard: ${label}`);
                });
            },
            async clearSelections() {
                await act(async () => {
                    await ctx.user.keyboard('{Escape}');
                });
            },
            async hoverElement(label: string | RegExp) {
                const el = (ctx.screen as typeof screen).getByLabelText(label);
                await act(async () => {
                    await ctx.user.hover(el);
                });
            },
            async hoverText(text: string | RegExp) {
                const el = (ctx.screen as typeof screen).getByText(text);
                await act(async () => {
                    await ctx.user.hover(el);
                });
            },
            async expectSelected(label: string | RegExp) {
                const el = getCell(label);
                expect(el).toHaveAttribute('aria-selected', 'true');
            },
            async expectNotSelected(label: string | RegExp) {
                const el = getCell(label);
                expect(el).not.toHaveAttribute('aria-selected', 'true');
            },
        };
    },
});
