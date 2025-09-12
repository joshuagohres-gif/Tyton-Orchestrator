'use client';

import { useEffect, useState } from 'react';

interface StarfieldLayerProps {
  className?: string;
  showConstellation?: boolean;
}

export default function StarfieldLayer({ 
  className = '', 
  showConstellation = false 
}: StarfieldLayerProps) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render on server to avoid hydration mismatch
  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 overflow-hidden pointer-events-none ${className}`} style={{ zIndex: -10 }}>
      {/* Sky gradient background */}
      <div className="absolute inset-0 starry-sky" />
      
      {/* Twinkling stars */}
      <div className="stars absolute inset-0" />
      
      {/* Optional constellation overlay */}
      {showConstellation && (
        <div className="constellation-overlay absolute inset-0" />
      )}
      
      {/* Subtle vignette effect */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(7, 9, 11, 0.3) 100%)'
        }}
      />
    </div>
  );
}

// Hook for managing starfield settings
export function useStarfieldSettings() {
  const [settings, setSettings] = useState({
    effects: 'subtle' as 'off' | 'subtle' | 'full',
    constellation: false,
    reducedMotion: false,
  });

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('starfield-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.warn('Failed to parse starfield settings:', e);
      }
    }

    // Check system preference for reduced motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setSettings(prev => ({
      ...prev,
      reducedMotion: mediaQuery.matches
    }));

    const handleChange = (e: MediaQueryListEvent) => {
      setSettings(prev => ({
        ...prev,
        reducedMotion: e.matches
      }));
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    // Apply settings to document
    document.documentElement.setAttribute('data-effects', settings.effects);
    document.documentElement.setAttribute('data-reduced-motion', String(settings.reducedMotion));
    
    // Save to localStorage
    localStorage.setItem('starfield-settings', JSON.stringify({
      effects: settings.effects,
      constellation: settings.constellation,
    }));
  }, [settings]);

  return { settings, setSettings };
}