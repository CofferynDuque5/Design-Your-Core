import { color, pillarById, type ColorScheme, type PillarId, type ThemeName } from '@dyc/tokens';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { readJson, writeJson } from './storage';

export type ThemePreference = 'system' | ThemeName;

interface ThemeValue {
  name: ThemeName;
  colors: ColorScheme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Colores de un pilar en el tema actual. */
  pillar: (id: PillarId) => { color: string; soft: string; chart: string };
}

const PREF_KEY = 'dyc.theme';
const ThemeContext = createContext<ThemeValue | null>(null);

export function resolveTheme(pref: ThemePreference, system: string | null | undefined): ThemeName {
  if (pref !== 'system') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children, initial = 'system' }: { children: ReactNode; initial?: ThemePreference }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>(initial);

  useEffect(() => {
    readJson(PREF_KEY, { preference: initial }).then((v) => setPref(v.preference));
  }, [initial]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    writeJson(PREF_KEY, { preference: p }).catch(() => undefined);
  }, []);

  const name = resolveTheme(preference, system);
  const value = useMemo<ThemeValue>(
    () => ({
      name,
      colors: color[name],
      preference,
      setPreference,
      pillar: (id) => {
        const p = pillarById(id);
        return { color: p.color[name], soft: p.soft[name], chart: p.chart[name] };
      },
    }),
    [name, preference, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme fuera de ThemeProvider');
  return v;
}
