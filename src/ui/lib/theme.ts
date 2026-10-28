import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ob:theme:v1';
export type Theme = 'light' | 'dark' | 'system';

const systemPrefersDark = (): boolean =>
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const applyTheme = (theme: Theme): void => {
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
};

const readTheme = (): Theme => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
};

export const useTheme = (): { theme: Theme; toggle: () => void } => {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const isDark = current === 'dark' || (current === 'system' && systemPrefersDark());
      return isDark ? 'light' : 'dark';
    });
  }, []);

  return { theme, toggle };
};
