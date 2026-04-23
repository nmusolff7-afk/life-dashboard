/**
 * Design tokens — ported verbatim from templates/index.html :root block.
 *
 * Dark = Flask's default (`:root, [data-theme="dark"]`).
 * Light = Flask's "medium" theme (iOS-light-style). There is no separate
 *   "medium" theme in the mobile app per PRD §4.8.9 (simplified from Flask's
 *   dark/medium/light to platform-default dark/light).
 * Category colors (fitness/nutrition/finance/time) are NOT in Flask — PRD/
 *   BUILD_APPROACH don't pin them either. Defaults chosen here for skeleton:
 *   Fitness = cal-strength green, Nutrition = macro-cal orange,
 *   Finance = protein blue, Time = carbs violet. Flagged for founder review.
 */

export type ThemeName = 'dark' | 'light';

export interface ThemeTokens {
  // Surfaces
  bg: string;
  surface: string;
  surface2: string;
  border: string;

  // Accents
  accent: string;
  accent2: string;
  btnBg: string;
  btnBg2: string;

  // Charts
  chartLine: string;
  chartFill: string;
  chartGrid: string;
  chartPointBorder: string;

  // Activity calendar
  calStrength: string;
  calCardio: string;
  calBoth: string;
  calRest: string;

  // Typography
  text: string;
  body: string;
  muted: string;
  subtle: string;

  // Macro colors
  cal: string;
  protein: string;
  carbs: string;
  fat: string;

  // Micro colors
  sugar: string;
  fiber: string;
  sodium: string;

  // Semantic
  danger: string;
  green: string;
  amber: string;

  // Category colors (NEW in mobile — not in Flask)
  fitness: string;
  nutrition: string;
  finance: string;
  time: string;

  // Shadow
  shadowCard: string;
}

export const dark: ThemeTokens = {
  bg: '#0A0A0F',
  surface: '#13131A',
  surface2: '#1C1C26',
  border: 'rgba(255,255,255,0.03)',

  accent: '#6C6FFF',
  accent2: '#8285FF',
  btnBg: '#6C6FFF',
  btnBg2: '#8285FF',

  chartLine: '#6C6FFF',
  chartFill: 'rgba(108,111,255,0.08)',
  chartGrid: 'rgba(255,255,255,0.024)',
  chartPointBorder: '#0A0A0F',

  calStrength: '#34D87A',
  calCardio: '#5BB8FF',
  calBoth: '#6C6FFF',
  calRest: '#1C1C26',

  text: '#FFFFFF',
  body: '#D0D0E0',
  muted: '#8888A0',
  subtle: '#555570',

  cal: '#FF8C42',
  protein: '#5BB8FF',
  carbs: '#A78BFA',
  fat: '#F472B6',

  sugar: '#FFD060',
  fiber: '#2DD4A8',
  sodium: '#8B9FCC',

  danger: '#FF4D4D',
  green: '#34D87A',
  amber: '#F5A623',

  fitness: '#34D87A',
  nutrition: '#FF8C42',
  finance: '#5BB8FF',
  time: '#A78BFA',

  shadowCard: '0 2px 20px rgba(0,0,0,0.45)',
};

export const light: ThemeTokens = {
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  surface2: '#F2F2F7',
  border: '#E5E5EA',

  accent: '#5856D6',
  accent2: '#5856D6',
  btnBg: '#5856D6',
  btnBg2: '#6E6CD8',

  chartLine: '#5856D6',
  chartFill: 'rgba(88,86,214,0.08)',
  chartGrid: '#E5E5EA',
  chartPointBorder: '#FFFFFF',

  calStrength: '#34C759',
  calCardio: '#5BB8FF',
  calBoth: '#5856D6',
  calRest: '#E5E5EA',

  text: '#1C1C1E',
  body: '#1C1C1E',
  muted: '#6C6C70',
  subtle: '#8E8E93',

  cal: '#FF8C00',
  protein: '#5BB8FF',
  carbs: '#A78BFA',
  fat: '#F472B6',

  sugar: '#E6B030',
  fiber: '#28BA94',
  sodium: '#7088B0',

  danger: '#FF3B30',
  green: '#34C759',
  amber: '#F5A623',

  fitness: '#34C759',
  nutrition: '#FF8C00',
  finance: '#5856D6',
  time: '#A78BFA',

  shadowCard: '0 1px 3px rgba(0,0,0,0.08)',
};

export const themes = { dark, light };

// Spacing / radii scale (ported from Flask :root layout tokens)
export const spacing = {
  screen: 18,
  card: 20,
  cards: 14,
};
export const radii = {
  card: 20,
  inner: 14,
  btn: 14,
  pill: 100,
  bar: 100,
  input: 14,
};
export const layout = {
  navHeight: 64,
  headerHeight: 56,
};
