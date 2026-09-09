import { z } from "zod";

export const scoreExpectationSchema = z.object({
  id: z.string().min(1).max(100),
  value: z.number().finite(),
  status: z.enum(["present", "absent", "excused"]),
  enteredAt: z.string().datetime(),
}).nullable();
export const gradebookChangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("score"), studentId: z.string().min(1).max(100), assessmentId: z.string().min(1).max(100), value: z.number().finite().nonnegative().max(1_000_000), status: z.enum(["present", "absent", "excused"]), expected: scoreExpectationSchema }),
  z.object({ action: z.literal("clearScore"), studentId: z.string().min(1).max(100), assessmentId: z.string().min(1).max(100), expected: scoreExpectationSchema }),
]);
export const gradebookChangesSchema = z.array(gradebookChangeSchema).min(1).max(500).superRefine((changes, ctx) => {
  const keys = new Set<string>();
  for (const change of changes) {
    const key = change.studentId + ":" + change.assessmentId;
    if (keys.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each mark may appear only once in a batch." });
    keys.add(key);
  }
});
export type GradebookChange = z.infer<typeof gradebookChangeSchema>;
