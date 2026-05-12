import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Toolbox } from './Toolbox';

describe('Toolbox', () => {
  it('calls onBlockSelect when an action block is clicked', () => {
    const onBlockSelect = vi.fn();
    render(<Toolbox onBlockSelect={onBlockSelect} />);

    fireEvent.click(screen.getByTestId('action-block-click'));

    expect(onBlockSelect).toHaveBeenCalledWith('click', 'action');
  });

  it('calls onBlockSelect when a control block is clicked', () => {
    const onBlockSelect = vi.fn();
    render(<Toolbox onBlockSelect={onBlockSelect} />);

    fireEvent.click(screen.getByTestId('control-block-loop'));

    expect(onBlockSelect).toHaveBeenCalledWith('loop', 'control');
  });

  it('calls onArmPlacement when the place button is clicked', () => {
    const onArmPlacement = vi.fn();
    render(<Toolbox onArmPlacement={onArmPlacement} />);

    fireEvent.click(screen.getAllByRole('button', { name: /在白板上指定位置放置/i })[0]);

    expect(onArmPlacement).toHaveBeenCalled();
  });
});
