-- Expand the global report-card design library. These presets are shared by
-- every school while the selected theme remains tenant-scoped in SchoolSettings.
ALTER TABLE "ReportCardTemplate" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ReportCardTemplate" DISABLE ROW LEVEL SECURITY;

INSERT INTO "ReportCardTemplate" ("id", "schoolId", "name", "layoutConfig")
VALUES
  ('preset-prestige-gold', NULL, 'Prestige Gold', '{"style":"prestige-gold","themeKey":"prestige-gold","watermark":""}'::jsonb),
  ('preset-burgundy-ivory', NULL, 'Burgundy Ivory', '{"style":"burgundy-ivory","themeKey":"burgundy-ivory","watermark":""}'::jsonb),
  ('preset-ocean-cyan', NULL, 'Ocean Cyan', '{"style":"ocean-cyan","themeKey":"ocean-cyan","watermark":""}'::jsonb),
  ('preset-emerald-modern', NULL, 'Emerald Modern', '{"style":"emerald-modern","themeKey":"emerald-modern","watermark":""}'::jsonb),
  ('preset-cocoa-earth', NULL, 'Cocoa Earth', '{"style":"cocoa-earth","themeKey":"cocoa-earth","watermark":""}'::jsonb),
  ('preset-graphite-lime', NULL, 'Graphite Lime', '{"style":"graphite-lime","themeKey":"graphite-lime","watermark":""}'::jsonb),
  ('preset-skyline-blue', NULL, 'Skyline Blue', '{"style":"skyline-blue","themeKey":"skyline-blue","watermark":""}'::jsonb),
  ('preset-midnight-teal', NULL, 'Midnight Teal', '{"style":"midnight-teal","themeKey":"midnight-teal","watermark":""}'::jsonb)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "ReportCardTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportCardTemplate" FORCE ROW LEVEL SECURITY;
