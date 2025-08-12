import React, { useMemo, useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { createKit } from '../src';
import { interactionsPlugin } from '../src/plugins/interactionsPlugin';

function ButtonSample() {
    return <button type="button">Press</button>;
}

function ClickablesSample() {
    const [count, setCount] = useState(0);
    const [altCount, setAltCount] = useState(0);
    return (
        <div>
            <button
                type="button"
                onClick={() => setCount((currentCount) => currentCount + 1)}
            >
                Increment
            </button>
            <button
                type="button"
                aria-label="Accept"
                onClick={() =>
                    setAltCount((currentAltCount) => currentAltCount + 1)
                }
            >
                Click Me
            </button>
            <button
                type="button"
                data-testid="target"
                onClick={() => setCount((currentCount) => currentCount + 1)}
            >
                Target Div
            </button>
            <div>{`count:${count}`}</div>
            <div>{`alt:${altCount}`}</div>
        </div>
    );
}

function NestedButtonSample() {
    const [count, setCount] = useState(0);
    return (
        <div>
            <button
                type="button"
                onClick={() => setCount((currentCount) => currentCount + 1)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        setCount((currentCount) => currentCount + 1);
                    }
                }}
                tabIndex={0}
                aria-label="Deep Press"
            >
                <span>
                    <span>Deep </span>
                    <span>Press</span>
                </span>
            </button>
            <div data-testid="nested-count">{`count:${count}`}</div>
        </div>
    );
}

function InputsSample() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    return (
        <form>
            <label htmlFor="name">Name</label>
            <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
            />
            <input
                data-testid="email-input"
                aria-label="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
            />
            <div data-testid="name-value">{name}</div>
            <div data-testid="email-value">{email}</div>
        </form>
    );
}

function HoverSample() {
    const [hoveredA, setHoveredA] = useState(false);
    const [hoveredB, setHoveredB] = useState(false);
    return (
        <div>
            <button
                type="button"
                aria-label="Info"
                onMouseOver={() => setHoveredA(true)}
                onFocus={() => setHoveredA(true)}
            >
                Has aria-label
            </button>
            <button
                type="button"
                onMouseOver={() => setHoveredB(true)}
                onFocus={() => setHoveredB(true)}
            >
                Hover Me
            </button>
            <div data-testid="hover-a">{hoveredA ? 'on' : 'off'}</div>
            <div data-testid="hover-b">{hoveredB ? 'on' : 'off'}</div>
        </div>
    );
}

function GridSample() {
    const labels = useMemo(() => ['A', 'B', 'C'], []);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const onKeyDown: React.KeyboardEventHandler = (event) => {
        if (event.key === 'ArrowRight') {
            setFocusedIndex((prev) => {
                const next =
                    prev === null ? 0 : Math.min(prev + 1, labels.length - 1);
                const cells =
                    containerRef.current?.querySelectorAll<HTMLElement>(
                        '[role="gridcell"]'
                    );
                const cell = cells?.item(next);
                cell?.focus();
                return next;
            });
        }
        if (event.key === 'Enter') {
            setSelectedIndex((prev) => focusedIndex ?? prev);
        }
        if (event.key === 'Escape') {
            setSelectedIndex(null);
        }
    };

    return (
        <div>
            <div
                role="grid"
                data-testid="grid-container"
                ref={containerRef}
                tabIndex={0}
                onKeyDown={onKeyDown}
            >
                <div role="row">
                    {labels.map((label, idx) =>
                        selectedIndex === idx ? (
                            <div
                                key={label}
                                role="gridcell"
                                aria-label={label}
                                aria-selected="true"
                                tabIndex={0}
                                onClick={() => setSelectedIndex(idx)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        setSelectedIndex(idx);
                                    }
                                    if (event.key === 'ArrowRight') {
                                        const next = Math.min(
                                            idx + 1,
                                            labels.length - 1
                                        );
                                        const cells =
                                            containerRef.current?.querySelectorAll<HTMLElement>(
                                                '[role="gridcell"]'
                                            );
                                        const nextCell = cells?.item(next);
                                        nextCell?.focus();
                                    }
                                }}
                            >
                                {label}
                            </div>
                        ) : (
                            <div
                                key={label}
                                role="gridcell"
                                aria-label={label}
                                aria-selected="false"
                                tabIndex={0}
                                onClick={() => setSelectedIndex(idx)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        setSelectedIndex(idx);
                                    }
                                    if (event.key === 'ArrowRight') {
                                        const next = Math.min(
                                            idx + 1,
                                            labels.length - 1
                                        );
                                        const cells =
                                            containerRef.current?.querySelectorAll<HTMLElement>(
                                                '[role="gridcell"]'
                                            );
                                        const nextCell = cells?.item(next);
                                        nextCell?.focus();
                                    }
                                }}
                            >
                                {label}
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

test('web interactions plugin can click by text', async () => {
    const kit = createKit();
    render(<ButtonSample />);

    await kit.flow.act(async () => {
        await kit.interactions.clickByText('Press');
    });

    await waitFor(async () =>
        expect(await screen.findByText('Press')).toBeInTheDocument()
    );
});

test('clickButton finds by role and fallback by text selector', async () => {
    const kit = createKit();
    render(<ClickablesSample />);

    await kit.flow.act(async () => {
        await kit.interactions.clickButton('Increment');
        await kit.interactions.clickButton('Click Me');
    });

    expect(screen.getByText('count:1')).toBeInTheDocument();
    expect(screen.getByText('alt:1')).toBeInTheDocument();
});

test('clickByTestId works', async () => {
    const kit = createKit();
    render(<ClickablesSample />);

    await kit.flow.act(async () => {
        await kit.interactions.clickByTestId('target');
    });

    expect(screen.getByText('count:1')).toBeInTheDocument();
});

test('clickByText walks up from nested spans to clickable ancestor', async () => {
    const kit = createKit();
    render(<NestedButtonSample />);

    await kit.flow.act(async () => {
        await kit.interactions.clickByText('Press');
    });

    expect(screen.getByTestId('nested-count')).toHaveTextContent('count:1');
});

test('typeText supports label and testId fallbacks', async () => {
    const kit = createKit();
    render(<InputsSample />);

    await kit.flow.act(async () => {
        await kit.interactions.typeText('Name', 'Alice');
        await kit.interactions.typeText('email-input', 'a@b.com');
    });

    expect(screen.getByTestId('name-value')).toHaveTextContent('Alice');
    expect(screen.getByTestId('email-value')).toHaveTextContent('a@b.com');
});

test('hoverElement and hoverText trigger mouseover', async () => {
    const kit = createKit();
    render(<HoverSample />);

    await kit.flow.act(async () => {
        await kit.interactions.hoverElement('Info');
        await kit.interactions.hoverText('Hover Me');
    });

    expect(screen.getByTestId('hover-a')).toHaveTextContent('on');
    expect(screen.getByTestId('hover-b')).toHaveTextContent('on');
});

test('clickCell, expectSelected/expectNotSelected, selectViaKb, clearSelections', async () => {
    const kit = createKit();
    render(<GridSample />);
    const firstCell = screen.getAllByRole('gridcell')[0] as HTMLDivElement;
    firstCell.focus();
    // Start from the first cell so Tab advances across focusable cells
    kit.add({ getContainer: () => firstCell });

    await kit.flow.act(async () => {
        await kit.interactions.clickCell('B');
    });

    await kit.interactions.expectSelected('B');
    await kit.interactions.expectNotSelected('C');

    await kit.flow.act(async () => {
        await kit.interactions.selectViaKb('C');
    });
    await kit.interactions.expectSelected('C');

    await kit.flow.act(async () => {
        await kit.interactions.clearSelections();
    });
    await kit.interactions.expectNotSelected('C');
});

test('throws a clear error when user is not a web userEvent instance', async () => {
    const kit = createKit();
    render(<div>Bad</div>);

    const fakeCtx = {
        screen,
        user: {},
    } as unknown as Parameters<typeof interactionsPlugin.setup>[0];

    const helpers = interactionsPlugin.setup(fakeCtx);
    await expect(helpers.clickByText('Bad')).rejects.toThrow(
        'test-kit: expected web userEvent instance'
    );

    // Sanity: regular kit still works
    await kit.flow.act(async () => {
        await kit.interactions.clickByText('Bad');
    });
});
