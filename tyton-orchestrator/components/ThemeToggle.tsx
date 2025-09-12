'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, Settings, Palette } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export type ThemeMode = 'starry' | 'high-contrast';

export default function ThemeToggle({ className = '', showLabel = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>('starry');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load theme from localStorage or default to starry
    const savedTheme = localStorage.getItem('theme') as ThemeMode;
    if (savedTheme && ['starry', 'high-contrast'].includes(savedTheme)) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'starry');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme: ThemeMode = theme === 'starry' ? 'high-contrast' : 'starry';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  if (!mounted) {
    return (
      <button 
        className={`p-2 rounded-lg border border-border bg-surface transition-colors ${className}`}
        disabled
      >
        <Palette className="w-5 h-5 text-muted" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={`
        group relative p-2 rounded-lg border border-border bg-surface 
        hover:border-accent hover:shadow-glow 
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        transition-all active:translate-y-[1px]
        ${className}
      `}
      title={`Switch to ${theme === 'starry' ? 'high contrast' : 'starry night'} theme`}
    >
      {theme === 'starry' ? (
        <Moon className="w-5 h-5 text-accent transition-transform group-hover:scale-110" />
      ) : (
        <Sun className="w-5 h-5 text-accent transition-transform group-hover:scale-110" />
      )}
      
      {showLabel && (
        <span className="ml-2 text-sm text-text">
          {theme === 'starry' ? 'Starry Night' : 'High Contrast'}
        </span>
      )}
    </button>
  );
}

// Hook for theme management
export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>('starry');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('theme') as ThemeMode;
    if (savedTheme && ['starry', 'high-contrast'].includes(savedTheme)) {
      setTheme(savedTheme);
    }
  }, []);

  const updateTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return { theme, updateTheme, mounted };
}