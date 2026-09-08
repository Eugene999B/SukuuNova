-- Additive report-card design presets. Existing templates and school selections remain intact.
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
