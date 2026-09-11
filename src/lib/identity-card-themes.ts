export const IDENTITY_CARD_THEME_KEYS = [
  "heritage-gold",
  "midnight-aurora",
  "emerald-crest",
  "royal-burgundy",
  "azure-wave",
  "graphite-pulse",
] as const;

export type IdentityCardThemeKey = typeof IDENTITY_CARD_THEME_KEYS[number];
export type IdentityCardLayout = "heritage" | "dark" | "crest" | "split" | "wave" | "tech";

export type IdentityCardTheme = {
  key: IdentityCardThemeKey;
  name: string;
  description: string;
  layout: IdentityCardLayout;
  frontBackground: string;
  backBackground: string;
  primary: string;
  accent: string;
  highlight: string;
  ink: string;
  muted: string;
  surface: string;
  surfaceAlt: string;
  line: string;
  footer: string;
  footerInk: string;
  portraitBorder: string;
  qrInk: string;
};

export const DEFAULT_IDENTITY_CARD_THEME: IdentityCardThemeKey = "heritage-gold";

export const IDENTITY_CARD_THEMES: readonly IdentityCardTheme[] = [
  {
    key: "heritage-gold",
    name: "Heritage Gold",
    description: "Warm ivory, deep navy and ceremonial gold with a classic institutional crest feel.",
    layout: "heritage",
    frontBackground: "#F7F1E4",
    backBackground: "#FBF7EE",
    primary: "#0A2740",
    accent: "#0D7F76",
    highlight: "#C99A3C",
    ink: "#0A1622",
    muted: "#596674",
    surface: "#FFFFFF",
    surfaceAlt: "#EFE5D2",
    line: "#D7C9AA",
    footer: "#0A2740",
    footerInk: "#FFFFFF",
    portraitBorder: "#C99A3C",
    qrInk: "#071722",
  },
  {
    key: "midnight-aurora",
    name: "Midnight Aurora",
    description: "Full dark navy credential with luminous teal and electric cyan security accents.",
    layout: "dark",
    frontBackground: "#071624",
    backBackground: "#091B2D",
    primary: "#0B2034",
    accent: "#22D3C5",
    highlight: "#6EE7F2",
    ink: "#F7FBFF",
    muted: "#A8B9C7",
    surface: "#102A41",
    surfaceAlt: "#0E263A",
    line: "#2B526A",
    footer: "#05111C",
    footerInk: "#FFFFFF",
    portraitBorder: "#22D3C5",
    qrInk: "#071624",
  },
  {
    key: "emerald-crest",
    name: "Emerald Crest",
    description: "Deep emerald, warm cream and antique gold with a crest-led academic identity.",
    layout: "crest",
    frontBackground: "#F3F0E5",
    backBackground: "#F7F5EC",
    primary: "#0E4B3D",
    accent: "#2F8B6D",
    highlight: "#D2A84E",
    ink: "#10261F",
    muted: "#596B63",
    surface: "#FFFDF7",
    surfaceAlt: "#E6EEE8",
    line: "#C9D4CC",
    footer: "#0E4B3D",
    footerInk: "#FFFFFF",
    portraitBorder: "#D2A84E",
    qrInk: "#0B2D25",
  },
  {
    key: "royal-burgundy",
    name: "Royal Burgundy",
    description: "Burgundy, champagne and charcoal arranged as a bold split-field executive card.",
    layout: "split",
    frontBackground: "#F5E9E4",
    backBackground: "#FBF3EF",
    primary: "#6D1733",
    accent: "#B34161",
    highlight: "#D6AE68",
    ink: "#23141A",
    muted: "#746069",
    surface: "#FFF8F5",
    surfaceAlt: "#EED9DD",
    line: "#D7BBC4",
    footer: "#36101F",
    footerInk: "#FFF8F5",
    portraitBorder: "#D6AE68",
    qrInk: "#281018",
  },
  {
    key: "azure-wave",
    name: "Azure Wave",
    description: "Bright institutional blue with flowing cyan layers and airy modern school styling.",
    layout: "wave",
    frontBackground: "#EAF5FF",
    backBackground: "#F4FAFF",
    primary: "#1455A3",
    accent: "#1AA5D8",
    highlight: "#6DD5ED",
    ink: "#0B2946",
    muted: "#557189",
    surface: "#FFFFFF",
    surfaceAlt: "#DCEFFD",
    line: "#B7D7ED",
    footer: "#0E4386",
    footerInk: "#FFFFFF",
    portraitBorder: "#1AA5D8",
    qrInk: "#0A2D4F",
  },
  {
    key: "graphite-pulse",
    name: "Graphite Pulse",
    description: "Charcoal credential with teal and violet pulse lines for a high-tech contemporary look.",
    layout: "tech",
    frontBackground: "#171B22",
    backBackground: "#1D222B",
    primary: "#242A34",
    accent: "#26E0C2",
    highlight: "#8C7CFF",
    ink: "#F8FAFC",
    muted: "#A9B1BE",
    surface: "#232A35",
    surfaceAlt: "#2B3340",
    line: "#46515F",
    footer: "#101319",
    footerInk: "#FFFFFF",
    portraitBorder: "#26E0C2",
    qrInk: "#11151B",
  },
] as const;

export function isIdentityCardThemeKey(value: unknown): value is IdentityCardThemeKey {
  return typeof value === "string" && (IDENTITY_CARD_THEME_KEYS as readonly string[]).includes(value);
}

export function identityCardThemeKeyFromBrandColors(value: unknown): IdentityCardThemeKey {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return isIdentityCardThemeKey(row.idCardTheme) ? row.idCardTheme : DEFAULT_IDENTITY_CARD_THEME;
}

export function identityCardTheme(value: unknown): IdentityCardTheme {
  const key = identityCardThemeKeyFromBrandColors(value);
  return IDENTITY_CARD_THEMES.find((theme) => theme.key === key) ?? IDENTITY_CARD_THEMES[0];
}
