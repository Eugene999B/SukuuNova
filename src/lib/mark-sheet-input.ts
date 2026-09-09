export type MarkStatus = "present" | "absent" | "excused";
export type PastedMark = { row: number; value: string; status: MarkStatus };

/** Blank clipboard rows retain their position and leave the corresponding learner unchanged. */
export function parseMarkSheetPaste(text: string, startRow: number, rowCount: number, maximum: number): PastedMark[] {
  if (!Number.isInteger(startRow) || startRow < 0 || startRow >= rowCount || !Number.isFinite(maximum) || maximum <= 0) throw new Error("Choose a mark cell in an activity first.");
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length > rowCount - startRow) throw new Error("The pasted rows extend beyond the class list. Nothing was pasted.");
  return lines.flatMap((line, index) => {
    if (!line.trim()) return [];
    const cells = line.split("\t").map(cell => cell.trim());
    if (cells.length > 2) throw new Error("Paste one mark column, optionally followed by a Present, Absent or Excused column.");
    const token = cells[0].toLowerCase();
    const aliases: Record<string, MarkStatus> = { p: "present", present: "present", a: "absent", absent: "absent", e: "excused", excused: "excused" };
    const statusText = (cells[1] || (Object.hasOwn(aliases, token) ? token : "present")).toLowerCase();
    const status = Object.hasOwn(aliases, statusText) ? aliases[statusText] : undefined;
    if (!status) throw new Error(`Row ${index + 1}: choose Present, Absent or Excused.`);
    const raw = aliases[token] ? "" : cells[0];
    if (!raw && status === "present") {
      if (!cells[0] && !cells[1]) return [];
      throw new Error(`Row ${index + 1}: a present learner needs a mark.`);
    }
    if (raw && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) throw new Error(`Row ${index + 1}: enter a numeric mark, A or E.`);
    const value = raw ? Number(raw) : 0;
    if (!Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`Row ${index + 1}: mark must be between 0 and ${maximum}.`);
    if (status !== "present" && value !== 0) throw new Error(`Row ${index + 1}: absent or excused learners use zero as the stored mark.`);
    return [{ row: startRow + index, value: String(value), status }];
  });
}
