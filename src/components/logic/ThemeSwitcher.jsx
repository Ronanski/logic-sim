import React from 'react';
import { Sun, Moon, Ruler } from 'lucide-react';
import { useTheme } from '@/lib/theme';

const OPTS = [
  { id: 'light', icon: Sun, label: 'Light' },
  { id: 'dark', icon: Moon, label: 'Dark' },
  { id: 'blueprint', icon: Ruler, label: 'Blueprint' },
];

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
      {OPTS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          title={`${label} theme`}
          onClick={() => setTheme(id)}
          className={`rounded-md p-1.5 transition-colors ${theme === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}