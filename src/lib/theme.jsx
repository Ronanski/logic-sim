import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });
export const THEMES = ['light', 'dark', 'blueprint'];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null);
  useEffect(() => { setTheme(localStorage.getItem('dcs-theme') || 'light'); }, []);
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-blueprint');
    if (theme === 'dark') root.classList.add('dark');
    if (theme === 'blueprint') root.classList.add('theme-blueprint');
    localStorage.setItem('dcs-theme', theme);
  }, [theme]);
  return <ThemeContext.Provider value={{ theme: theme || 'light', setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);