import { lima } from '@dyc/tokens';
import { DEFAULT_THEME, resolveTheme } from './theme';

describe('tema', () => {
  it('sigue al sistema salvo que la persona elija uno', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', null)).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });
});

describe('paleta', () => {
  it('es negro con lima y arranca en oscuro, como la web', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(lima.dark.primary).toBe('#C8F23A');
    expect(lima.dark.bg).toBe('#0A0B09');
  });
});
