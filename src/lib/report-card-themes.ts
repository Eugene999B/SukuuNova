export type ReportCardTheme = {
  id: string;
  key: string;
  name: string;
  description: string;
  density: "standard" | "compact";
  primary: string;
  accent: string;
  ink: string;
  paper: string;
  headerMode: "crest" | "band" | "formal" | "minimal";
  fontMode: "serif" | "sans";
};

export const REPORT_CARD_THEMES: ReportCardTheme[] = [
  { id: "preset-ghana-classic", key: "ghana-classic", name: "Ghana Classic", description: "Traditional Ghanaian terminal-report structure with a strong crest header and formal result grid.", density: "standard", primary: "#143f77", accent: "#eef4fb", ink: "#172033", paper: "#ffffff", headerMode: "crest", fontMode: "serif" },
  { id: "preset-scholar-blue", key: "scholar-blue", name: "Scholar Blue", description: "Academic blue treatment with restrained institutional accents.", density: "standard", primary: "#1d4ed8", accent: "#eff6ff", ink: "#172033", paper: "#ffffff", headerMode: "band", fontMode: "sans" },
  { id: "preset-heritage-green", key: "heritage-green", name: "Heritage Green", description: "Formal heritage layout with calm green academic accents.", density: "standard", primary: "#166534", accent: "#f0fdf4", ink: "#17231a", paper: "#fffef9", headerMode: "crest", fontMode: "serif" },
  { id: "preset-modern-teal", key: "modern-teal", name: "Modern Teal", description: "Contemporary SukuuNova layout with clean teal structure and generous spacing.", density: "standard", primary: "#0f766e", accent: "#f0fdfa", ink: "#102826", paper: "#ffffff", headerMode: "band", fontMode: "sans" },
  { id: "preset-formal-navy", key: "formal-navy", name: "Formal Navy", description: "Conservative administrative layout suitable for secondary schools and colleges.", density: "standard", primary: "#172554", accent: "#eef2ff", ink: "#111827", paper: "#ffffff", headerMode: "formal", fontMode: "serif" },
  { id: "preset-minimal-slate", key: "minimal-slate", name: "Minimal Slate", description: "Low-ink, highly readable monochrome-friendly academic report.", density: "standard", primary: "#334155", accent: "#f8fafc", ink: "#0f172a", paper: "#ffffff", headerMode: "minimal", fontMode: "sans" },
  { id: "preset-royal-purple", key: "royal-purple", name: "Royal Purple", description: "Distinctive formal theme for schools with purple branding.", density: "standard", primary: "#6b21a8", accent: "#faf5ff", ink: "#2e143d", paper: "#ffffff", headerMode: "formal", fontMode: "serif" },
  { id: "preset-warm-amber", key: "warm-amber", name: "Warm Amber", description: "Warm scholarly treatment with subtle ceremonial accents.", density: "standard", primary: "#a16207", accent: "#fffbeb", ink: "#3b2f1c", paper: "#fffdf7", headerMode: "crest", fontMode: "serif" },
  { id: "preset-crest-red", key: "crest-red", name: "Crest Red", description: "Crest-led formal report designed for schools using red institutional branding.", density: "standard", primary: "#991b1b", accent: "#fef2f2", ink: "#331515", paper: "#ffffff", headerMode: "crest", fontMode: "serif" },
  { id: "preset-academic-indigo", key: "academic-indigo", name: "Academic Indigo", description: "Structured indigo report with clear sections and dense result readability.", density: "standard", primary: "#4338ca", accent: "#eef2ff", ink: "#1e1b4b", paper: "#ffffff", headerMode: "band", fontMode: "sans" },
  { id: "preset-clean-mono", key: "clean-mono", name: "Clean Monochrome", description: "Printer-efficient black-and-white layout with excellent photocopy legibility.", density: "standard", primary: "#111111", accent: "#f5f5f5", ink: "#111111", paper: "#ffffff", headerMode: "minimal", fontMode: "serif" },
  { id: "preset-executive-compact", key: "executive-compact", name: "Executive Compact", description: "Compact one-page layout for classes with many subjects while preserving hierarchy.", density: "compact", primary: "#0f3d57", accent: "#edf7fa", ink: "#10232d", paper: "#ffffff", headerMode: "formal", fontMode: "sans" },
];

export const DEFAULT_REPORT_CARD_THEME_ID = "preset-ghana-classic";

export function reportCardThemeById(id: string | null | undefined) {
  return REPORT_CARD_THEMES.find((theme) => theme.id === id) ?? REPORT_CARD_THEMES[0];
}

export function reportCardThemeByKey(key: string | null | undefined) {
  return REPORT_CARD_THEMES.find((theme) => theme.key === key) ?? REPORT_CARD_THEMES[0];
}
