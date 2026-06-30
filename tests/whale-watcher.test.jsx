import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import WhaleWatcher from '../src/WhaleWatcher.jsx';
import fixture from '../src/data/whale-watcher.fixture.json';

describe('Whale Watcher', () => {
  it('renders the surface', () => {
    render(<WhaleWatcher />);
    expect(screen.getByTestId('whale-watcher')).toBeInTheDocument();
  });

  it('renders KPI cards', () => {
    render(<WhaleWatcher />);
    expect(screen.getByText('Tracked Wallets')).toBeInTheDocument();
    expect(screen.getByText('Active (7d)')).toBeInTheDocument();
    expect(screen.getByText('Volume (7d)')).toBeInTheDocument();
    expect(screen.getByText('Largest Spike')).toBeInTheDocument();
  });

  it('renders fixture wallet labels', () => {
    render(<WhaleWatcher />);
    for (const w of fixture.wallets) {
      expect(screen.getAllByText(w.label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('shows wallet detail with cadence chart on row click', () => {
    render(<WhaleWatcher />);
    fireEvent.click(screen.getAllByText(fixture.wallets[0].label)[0]);
    expect(screen.getByTestId('wallet-detail')).toBeInTheDocument();
    expect(screen.getByLabelText('12-week activity cadence')).toBeInTheDocument();
  });

  it('filters by wallet type', () => {
    render(<WhaleWatcher />);
    fireEvent.click(screen.getByText('Whales'));
    const whales = fixture.wallets.filter((w) => w.type === 'whale');
    for (const w of whales) {
      expect(screen.getAllByText(w.label).length).toBeGreaterThanOrEqual(1);
    }
    const nonWhale = fixture.wallets.find((w) => w.type !== 'whale');
    expect(screen.queryAllByText(nonWhale.label)).toHaveLength(0);
  });

  it('shows disclaimer', () => {
    render(<WhaleWatcher />);
    expect(screen.getByTestId('disclaimer')).toBeInTheDocument();
  });

  it('fixture contains only demo-labeled addresses', () => {
    for (const w of fixture.wallets) {
      expect(w.address_demo).toMatch(/DEMO/i);
    }
  });
});
