import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FailureDetails } from '../FailureDetails';
import { failureOf, groupFailures, type SyncFailure } from '../../../utils/syncFailures';

describe('syncFailures', () => {
  it('takes the error message, else a fallback', () => {
    expect(failureOf('A-1', new Error('boom'))).toEqual({ key: 'A-1', error: 'boom' });
    expect(failureOf('A-1', 'plain')).toEqual({ key: 'A-1', error: 'plain' });
    expect(failureOf('A-1', {}, 'fallback')).toEqual({ key: 'A-1', error: 'fallback' });
  });

  it('groups by error, largest group first', () => {
    expect(groupFailures([
      { key: 'A', error: 'x' }, { key: 'B', error: 'y' }, { key: 'C', error: 'y' },
    ])).toEqual([{ error: 'y', keys: ['B', 'C'] }, { error: 'x', keys: ['A'] }]);
  });
});

describe('FailureDetails', () => {
  const many: SyncFailure[] = [
    ...Array.from({ length: 150 }, (_, i) => ({ key: `J-${i}`, error: 'HTTP 401' })),
    { key: 'DR-9', error: 'Feature DR-9 not found in Aha!.' },
  ];

  it('renders nothing without failures', () => {
    const { container } = render(<FailureDetails failures={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows one collapsed row per error, listing at most 100 keys', () => {
    render(<FailureDetails failures={many} />);
    expect(screen.getByText('151 failed')).toBeTruthy();
    expect(screen.getByText('(2 distinct errors)')).toBeTruthy();
    expect(screen.getByText('×150')).toBeTruthy();
    const body = screen.getByText(/J-0, J-1/);
    expect(body.textContent).toContain('J-99');
    expect(body.textContent).not.toContain('J-100,');
    expect(screen.getByText('+50 more')).toBeTruthy();
  });

  it('filters by key or error', () => {
    render(<FailureDetails failures={many} />);
    const filter = screen.getByLabelText('Filter failures');
    fireEvent.change(filter, { target: { value: 'dr-9' } });
    expect(screen.queryByText('×150')).toBeNull();
    expect(screen.getByText('DR-9')).toBeTruthy();
    fireEvent.change(filter, { target: { value: '401' } });
    expect(screen.getByText('×150')).toBeTruthy();
    fireEvent.change(filter, { target: { value: 'nothing' } });
    expect(screen.getByText('No failures match the filter.')).toBeTruthy();
  });

  it('hides the filter for a short list', () => {
    render(<FailureDetails failures={[{ key: 'A', error: 'x' }]} />);
    expect(screen.queryByLabelText('Filter failures')).toBeNull();
  });
});
