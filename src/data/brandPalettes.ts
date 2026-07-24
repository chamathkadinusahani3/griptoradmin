import type { CSSProperties } from 'react';

export interface BrandPalette {
  id: string;
  label: string;
  colors: {
    navy: string;
    royal: string;
    brightBlue: string;
    teal: string;
    cyan: string;
  };
}

// Kept in sync manually with BRAND_PALETTE_IDS in api/_lib/models/Client.ts —
// can't import across the api/src boundary (see that file's comment).
export const BRAND_PALETTES: BrandPalette[] = [
  {
    id: 'blue',
    label: 'Blue (default)',
    colors: { navy: '#19356E', royal: '#2164B4', brightBlue: '#2A8BD4', teal: '#1EA4B6', cyan: '#22C1C7' },
  },
  {
    id: 'yellow',
    label: 'Yellow',
    colors: { navy: '#B77900', royal: '#D99A00', brightBlue: '#D99A00', teal: '#F4B400', cyan: '#FFC107' },
  },
  {
    id: 'green',
    label: 'Green',
    colors: { navy: '#14532D', royal: '#15803D', brightBlue: '#15803D', teal: '#16A34A', cyan: '#22C55E' },
  },
  {
    id: 'pink',
    label: 'Pink',
    colors: { navy: '#9D174D', royal: '#BE185D', brightBlue: '#BE185D', teal: '#DB2777', cyan: '#EC4899' },
  },
  {
    id: 'purple',
    label: 'Purple',
    colors: { navy: '#4C1D95', royal: '#6D28D9', brightBlue: '#6D28D9', teal: '#7C3AED', cyan: '#8B5CF6' },
  },
  {
    id: 'orange',
    label: 'Orange',
    colors: { navy: '#9A3412', royal: '#C2410C', brightBlue: '#C2410C', teal: '#EA580C', cyan: '#F97316' },
  },
  {
    id: 'black',
    label: 'Black',
    colors: { navy: '#111111', royal: '#1F2937', brightBlue: '#1F2937', teal: '#374151', cyan: '#4B5563' },
  },
  {
    id: 'brown',
    label: 'Brown',
    colors: { navy: '#3E2723', royal: '#4E342E', brightBlue: '#4E342E', teal: '#6D4C41', cyan: '#8D6E63' },
  },
  {
    id: 'grey',
    label: 'Grey',
    colors: { navy: '#111827', royal: '#374151', brightBlue: '#374151', teal: '#6B7280', cyan: '#9CA3AF' },
  },
];

export const DEFAULT_BRAND_PALETTE = BRAND_PALETTES[0];

export function getBrandPalette(paletteId: string | undefined): BrandPalette {
  return BRAND_PALETTES.find((p) => p.id === paletteId) ?? DEFAULT_BRAND_PALETTE;
}

/** Resolves a palette into the inline CSS custom properties TenantThemeScope applies. */
export function paletteCssVars(palette: BrandPalette): CSSProperties {
  return {
    '--brand-navy': palette.colors.navy,
    '--brand-royal': palette.colors.royal,
    '--brand-bright-blue': palette.colors.brightBlue,
    '--brand-teal': palette.colors.teal,
    '--brand-cyan': palette.colors.cyan,
  } as CSSProperties;
}
