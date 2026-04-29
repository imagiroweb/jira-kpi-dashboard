import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DateRangePicker } from './DateRangePicker';

describe('DateRangePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('affiche la plage de dates courante', () => {
    render(
      <DateRangePicker
        value={{ from: '2026-04-01', to: '2026-04-29' }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText(/01 avr\./i)).toBeInTheDocument();
    expect(screen.getByText(/29 avr\./i)).toBeInTheDocument();
  });

  it('applique une plage personnalisee', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateRangePicker
        value={{ from: '2026-04-01', to: '2026-04-29' }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button'));

    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-04-05' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-04-20' } });
    fireEvent.click(screen.getByRole('button', { name: /appliquer/i }));

    expect(onChange).toHaveBeenCalledWith({ from: '2026-04-05', to: '2026-04-20' });
    expect(screen.queryByText(/raccourcis/i)).not.toBeInTheDocument();
  });

  it('applique un preset de periode', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        value={{ from: '2026-04-01', to: '2026-04-29' }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: /7 derniers jours/i }));

    expect(onChange).toHaveBeenCalledWith({ from: '2026-04-22', to: '2026-04-29' });
  });
});
