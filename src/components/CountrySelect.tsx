import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { ALL_COUNTRIES } from '../data/countries';

interface CountrySelectProps {
  value: string;
  onChange: (country: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const CountrySelect: React.FC<CountrySelectProps> = ({
  value,
  onChange,
  placeholder = 'Select country',
  className = '',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const filteredCountries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_COUNTRIES;
    const startsWith = ALL_COUNTRIES.filter((c) => c.toLowerCase().startsWith(q));
    const includes = ALL_COUNTRIES.filter(
      (c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q)
    );
    return [...startsWith, ...includes];
  }, [query]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handleSelect = (country: string) => {
    onChange(country);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs text-left flex items-center justify-between gap-2 hover:border-slate-300 focus:outline-none focus:border-[#1c46be] disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
      >
        <span className={`truncate ${value ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedIdx((idx) =>
                      Math.min(idx + 1, Math.max(0, filteredCountries.length - 1))
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIdx((idx) => Math.max(0, idx - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const picked = filteredCountries[highlightedIdx];
                    if (picked) handleSelect(picked);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
                placeholder="Search country..."
                className="w-full h-8 pl-8 pr-7 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#1c46be]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Clear country search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <ul
            role="listbox"
            className="max-h-56 overflow-y-auto py-1 divide-y divide-slate-50"
          >
            {filteredCountries.length === 0 ? (
              <li className="px-3 py-3 text-xs text-slate-500 text-center">
                No matching countries found
              </li>
            ) : (
              filteredCountries.map((country, idx) => {
                const isSelected = country.toLowerCase() === (value || '').trim().toLowerCase();
                const isHighlighted = idx === highlightedIdx;
                return (
                  <li key={country}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      onClick={() => handleSelect(country)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-[#1c46be] font-semibold'
                          : isHighlighted
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{country}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#1c46be] shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
