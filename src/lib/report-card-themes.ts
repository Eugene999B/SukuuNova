export type ReportCardTheme = {
  id: string;
  key: string;
  name: string;
  description: string;
  density: "standard" | "compact";
};

export const REPORT_CARD_THEMES: ReportCardTheme[] = [
  { id: "preset-ghana-classic", key: "ghana-classic", name: "Ghana Classic", description: "Traditional Ghanaian terminal-report structure with a strong crest header and formal result grid.", density: "standard" },
  { id: "preset-scholar-blue", key: "scholar-blue", name: "Scholar Blue", description: "Academic blue treatment with restrained institutional accents.", density: "standard" },
  { id: "preset-heritage-green", key: "heritage-green", name: "Heritage Green", description: "Formal heritage layout with calm green academic accents.", density: "standard" },
  { id: "preset-modern-teal", key: "modern-teal", name: "Modern Teal", description: "Contemporary SukuuNova layout with clean teal structure and generous spacing.", density: "standard" },
  { id: "preset-formal-navy", key: "formal-navy", name: "Formal Navy", description: "Conservative administrative layout suitable for secondary schools and colleges.", density: "standard" },
  { id: "preset-minimal-slate", key: "minimal-slate", name: "Minimal Slate", description: "Low-ink, highly readable monochrome-friendly academic report.", density: "standard" },
  { id: "preset-royal-purple", key: "royal-purple", name: "Royal Purple", description: "Distinctive formal theme for schools with purple branding.", density: "standard" },
  { id: "preset-warm-amber", key: "warm-amber", name: "Warm Amber", description: "Warm scholarly treatment with subtle ceremonial accents.", density: "standard" },
  { id: "preset-crest-red", key: "crest-red", name: "Crest Red", description: "Crest-led formal report designed for schools using red institutional branding.", density: "standard" },
  { id: "preset-academic-indigo", key: "academic-indigo", name: "Academic Indigo", description: "Structured indigo report with clear sections and dense result readability.", density: "standard" },
  { id: "preset-clean-mono", key: "clean-mono", name: "Clean Monochrome", description: "Printer-efficient black-and-white layout with excellent photocopy legibility.", density: "standard" },
  { id: "preset-executive-compact", key: "executive-compact", name: "Executive Compact", description: "Compact one-page layout for classes with many subjects while preserving hierarchy.", density: "compact" },
];

export const DEFAULT_REPORT_CARD_THEME_ID = "preset-ghana-classic";

export function reportCardThemeById(id: string | null | undefined) {
  return REPORT_CARD_THEMES.find((theme) => theme.id === id) ?? REPORT_CARD_THEMES[0];
}

export function reportCardThemeByKey(key: string | null | undefined) {
  return REPORT_CARD_THEMES.find((theme) => theme.key === key) ?? REPORT_CARD_THEMES[0];
}
