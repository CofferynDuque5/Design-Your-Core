import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Scale } from './Form';

function Harness() {
  const [v, setV] = useState<number | null>(null);
  return (
    <>
      <Scale legend="Ánimo" value={v} onChange={setV} low="Bajo" high="Muy bien" />
      <output>{v ?? 'vacío'}</output>
    </>
  );
}

describe('Scale', () => {
  it('se elige con un toque y se desmarca con otro', async () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Ánimo' });
    expect(group).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    expect(screen.getByText('4', { selector: 'output' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    expect(screen.getByText('vacío')).toBeInTheDocument();
  });

  it('los extremos de la escala tienen nombre para lectores de pantalla', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: /^1\s+Bajo$/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^5\s+Muy bien$/ })).toBeInTheDocument();
  });
});
