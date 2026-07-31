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

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Shifts a hex color's HSL lightness by a delta (positive = lighter, negative = darker), clamped to [0,1]. */
function shiftLightness(hex: string, delta: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.min(1, Math.max(0, l + delta)));
}

/**
 * Derives a full 5-shade BrandPalette from one user-picked accent color via
 * pure lightness shifts (no hue/saturation manipulation) — treats the input
 * as the "royal" role (the most prominent existing preset color), darker
 * shifts toward navy, lighter shifts toward cyan. Not as hand-tuned as the 9
 * curated presets, but a reasonable, always-legible default derived from
 * any input.
 */
export function paletteFromAccent(hex: string): BrandPalette {
  return {
    id: 'custom',
    label: 'Custom',
    colors: {
      navy: shiftLightness(hex, -0.22),
      royal: hex,
      brightBlue: shiftLightness(hex, 0.08),
      teal: shiftLightness(hex, 0.16),
      cyan: shiftLightness(hex, 0.28),
    },
  };
}

/** Single resolution point for "what palette should currently render" — use this instead of getBrandPalette directly wherever a tenant's branding is being rendered, so a paletteId of 'custom' resolves to their derived accent palette instead of silently falling back to the default blue preset. */
export function resolveBrandPalette(branding: { paletteId?: string; accentColor?: string } | undefined): BrandPalette {
  if (branding?.paletteId === 'custom' && branding.accentColor) {
    return paletteFromAccent(branding.accentColor);
  }
  return getBrandPalette(branding?.paletteId);
}

export interface FontOption {
  id: string;
  label: string;
}

// Curated, not arbitrary — same reasoning as the 9 curated palettes: avoids
// illegible/broken font choices and keeps every tenant's dashboard looking
// professional. Each must have a matching @import in src/index.css.
export const FONT_OPTIONS: FontOption[] = [
  { id: 'Inter', label: 'Inter (default)' },
  { id: 'Roboto', label: 'Roboto' },
  { id: 'Poppins', label: 'Poppins' },
  { id: 'Nunito', label: 'Nunito' },
  { id: 'Manrope', label: 'Manrope' },
];

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
