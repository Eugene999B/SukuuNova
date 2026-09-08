-- Additive global report-card design presets.
-- ReportCardTemplate already has FORCE RLS by this point in the migration
-- history. Migrations run as the schema owner, so temporarily suspend the
-- table policy only for this controlled DDL/data step and restore it before
-- the transaction completes. Runtime application connections remain subject
-- to the existing tenant/global-template policy.
ALTER TABLE "ReportCardTemplate" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ReportCardTemplate" DISABLE ROW LEVEL SECURITY;

INSERT INTO "ReportCardTemplate" ("id", "schoolId", "name", "layoutConfig")
VALUES
  ('preset-ghana-classic', NULL, 'Ghana Classic', '{"style":"ghana-classic","themeKey":"ghana-classic","watermark":""}'::jsonb),
  ('preset-scholar-blue', NULL, 'Scholar Blue', '{"style":"scholar-blue","themeKey":"scholar-blue","watermark":""}'::jsonb),
  ('preset-heritage-green', NULL, 'Heritage Green', '{"style":"heritage-green","themeKey":"heritage-green","watermark":""}'::jsonb),
  ('preset-modern-teal', NULL, 'Modern Teal', '{"style":"modern-teal","themeKey":"modern-teal","watermark":""}'::jsonb),
  ('preset-formal-navy', NULL, 'Formal Navy', '{"style":"formal-navy","themeKey":"formal-navy","watermark":""}'::jsonb),
  ('preset-minimal-slate', NULL, 'Minimal Slate', '{"style":"minimal-slate","themeKey":"minimal-slate","watermark":""}'::jsonb),
  ('preset-royal-purple', NULL, 'Royal Purple', '{"style":"royal-purple","themeKey":"royal-purple","watermark":""}'::jsonb),
  ('preset-warm-amber', NULL, 'Warm Amber', '{"style":"warm-amber","themeKey":"warm-amber","watermark":""}'::jsonb),
  ('preset-crest-red', NULL, 'Crest Red', '{"style":"crest-red","themeKey":"crest-red","watermark":""}'::jsonb),
  ('preset-academic-indigo', NULL, 'Academic Indigo', '{"style":"academic-indigo","themeKey":"academic-indigo","watermark":""}'::jsonb),
  ('preset-clean-mono', NULL, 'Clean Monochrome', '{"style":"clean-mono","themeKey":"clean-mono","watermark":""}'::jsonb),
  ('preset-executive-compact', NULL, 'Executive Compact', '{"style":"executive-compact","themeKey":"executive-compact","watermark":""}'::jsonb)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "ReportCardTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportCardTemplate" FORCE ROW LEVEL SECURITY;
