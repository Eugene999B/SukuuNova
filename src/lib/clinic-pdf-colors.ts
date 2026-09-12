import { rgb } from "pdf-lib";

export const CLINIC_PDF_COLORS = {
  brand: rgb(0.05, 0.35, 0.24),
  heading: rgb(0.06, 0.1, 0.16),
  text: rgb(0.19, 0.24, 0.31),
  rule: rgb(0.85, 0.88, 0.91),
} as const;
