'use client';

import { useState, useEffect } from 'react';
import { X, Settings, Palette, Sparkles, Accessibility, Star } from 'lucide-react';
import ThemeToggle, { useTheme, type ThemeMode } from './ThemeToggle';
import { useStarfieldSettings } from './StarfieldLayer';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const { theme, updateTheme } = useTheme();
  const { settings, setSettings } = useStarfieldSettings();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    // Prevent body scroll when drawer is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!mounted) return null;

  const handleThemeChange = (newTheme: ThemeMode) => {
    updateTheme(newTheme);
  };

  const handleEffectsChange = (effects: 'off' | 'subtle' | 'full') => {
    setSettings(prev => ({ ...prev, effects }));
  };

  const handleConstellationToggle = () => {
    setSettings(prev => ({ ...prev, constellation: !prev.constellation }));
  };

  const handleReducedMotionToggle = () => {
    setSettings(prev => ({ ...prev, reducedMotion: !prev.reducedMotion }));
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`
          fixed top-0 right-0 h-full w-80 bg-surface border-l border-border shadow-card z-50
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-text">Theme & Effects</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-bg-elev transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Theme Selection */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-accent" />
              <h3 className="font-medium text-text">Theme</h3>
            </div>
            
            <div className="space-y-2">
              <button
                onClick={() => handleThemeChange('starry')}
                className={`
                  w-full p-3 rounded-lg border text-left transition-all
                  ${theme === 'starry' 
                    ? 'border-accent bg-gradient-surface shadow-glow' 
                    : 'border-border bg-bg-elev hover:border-accent/50'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-gradient-gold" />
                  <div>
                    <div className="font-medium text-text">Starry Night</div>
                    <div className="text-sm text-muted">Gold accents with starfield background</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => handleThemeChange('high-contrast')}
                className={`
                  w-full p-3 rounded-lg border text-left transition-all
                  ${theme === 'high-contrast' 
                    ? 'border-accent bg-gradient-surface shadow-glow' 
                    : 'border-border bg-bg-elev hover:border-accent/50'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-white" />
                  <div>
                    <div className="font-medium text-text">High Contrast</div>
                    <div className="text-sm text-muted">Enhanced visibility and legibility</div>
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* Effects Intensity */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-accent" />
              <h3 className="font-medium text-text">Effects Intensity</h3>
            </div>
            
            <div className="space-y-2">
              {[
                { value: 'off' as const, label: 'Off', desc: 'No animations or effects' },
                { value: 'subtle' as const, label: 'Subtle', desc: 'Minimal effects (recommended)' },
                { value: 'full' as const, label: 'Full', desc: 'All effects enabled' },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => handleEffectsChange(value)}
                  className={`
                    w-full p-3 rounded-lg border text-left transition-all
                    ${settings.effects === value 
                      ? 'border-accent bg-gradient-surface' 
                      : 'border-border bg-bg-elev hover:border-accent/50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-text">{label}</div>
                      <div className="text-sm text-muted">{desc}</div>
                    </div>
                    {settings.effects === value && (
                      <div className="w-2 h-2 rounded-full bg-accent" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Additional Options */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 text-accent" />
              <h3 className="font-medium text-text">Starfield Options</h3>
            </div>
            
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-lg border border-border bg-bg-elev hover:border-accent/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-medium text-text">Show Constellations</div>
                  <div className="text-sm text-muted">Subtle constellation lines</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.constellation}
                  onChange={handleConstellationToggle}
                  className="sr-only"
                />
                <div className={`
                  relative w-11 h-6 rounded-full transition-colors
                  ${settings.constellation ? 'bg-accent' : 'bg-border'}
                `}>
                  <div className={`
                    absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform
                    ${settings.constellation ? 'translate-x-5' : 'translate-x-0.5'}
                  `} />
                </div>
              </label>
            </div>
          </section>

          {/* Accessibility */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Accessibility className="w-4 h-4 text-accent" />
              <h3 className="font-medium text-text">Accessibility</h3>
            </div>
            
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-lg border border-border bg-bg-elev hover:border-accent/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-medium text-text">Reduce Motion</div>
                  <div className="text-sm text-muted">Override system preference</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={handleReducedMotionToggle}
                  className="sr-only"
                />
                <div className={`
                  relative w-11 h-6 rounded-full transition-colors
                  ${settings.reducedMotion ? 'bg-accent' : 'bg-border'}
                `}>
                  <div className={`
                    absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform
                    ${settings.reducedMotion ? 'translate-x-5' : 'translate-x-0.5'}
                  `} />
                </div>
              </label>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-border bg-surface">
          <div className="text-xs text-muted text-center">
            Theme settings are saved locally and persist between sessions
          </div>
        </div>
      </div>
    </>
  );
}

// Hook for managing settings drawer
export function useSettingsDrawer() {
  const [isOpen, setIsOpen] = useState(false);

  const openSettings = () => setIsOpen(true);
  const closeSettings = () => setIsOpen(false);
  const toggleSettings = () => setIsOpen(prev => !prev);

  return { isOpen, openSettings, closeSettings, toggleSettings };
}