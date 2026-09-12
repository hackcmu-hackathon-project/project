export const colors = {
  bg: '#f8f6f3',
  page: '#ebe7e1',
  surface: '#ffffff',
  sunken: '#eee9e2',
  hair: '#e6e1da',
  line: '#e2ddd5',
  border: '#ddd7cf',
  ink: '#1c1a19',
  ink2: '#3a3633',
  muted: '#5a544e',
  soft: '#7a746d',
  faint: '#9a938b',
  plum: '#8a2d6e',
  plumSoft: '#e4b7d6',
  gold: '#d9a441',
  chip: '#e4dfd8',
};

export const font = {
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'Geist_400Regular',
  med: 'Geist_500Medium',
  semi: 'Geist_600SemiBold',
};

export const radius = { sm: 10, md: 12, lg: 14, xl: 16, xxl: 20, pill: 999 };

/** Tier score bands, matching the Rove ranking model. */
export const TIERS = {
  loved: { label: 'Loved it', range: [8, 10] as [number, number], hint: '8 – 10' },
  liked: { label: 'Liked it', range: [5, 7.9] as [number, number], hint: '5 – 7.9' },
  okay: { label: 'It was fine', range: [2, 4.9] as [number, number], hint: 'under 5' },
};
export type Tier = keyof typeof TIERS;
export const TIER_ORDER: Tier[] = ['loved', 'liked', 'okay'];

export function scoreColors(s: number | null): [string, string] {
  if (s == null) return [colors.chip, colors.muted];
  if (s >= 8) return [colors.plum, '#fff'];
  if (s >= 5) return [colors.gold, colors.ink];
  return [colors.chip, colors.muted];
}

export const fmtScore = (s: number | null | undefined) => (s == null ? '–' : s.toFixed(1));

export const shadow = {
  tab: { shadowColor: '#1c1a19', shadowOpacity: 0.08, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  soft: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
};
