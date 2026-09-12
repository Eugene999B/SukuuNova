import { Download, FileText, Table2 } from "lucide-react";

export function DossierExportActions({ kind, id }: { kind: "student" | "staff"; id: string }) {
  const base = `/api/school/dossiers/${kind}/${encodeURIComponent(id)}`;
  return (
    <div className="product-dossier-actions" aria-label={`${kind} dossier downloads`} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <a className="button secondary" href={`${base}?format=pdf`}>
        <Download size={15} aria-hidden="true" /> Dossier PDF
      </a>
      <a className="button secondary" href={`${base}?format=docx`}>
        <FileText size={15} aria-hidden="true" /> Word DOCX
      </a>
      <a className="button secondary" href={`${base}?format=xlsx`}>
        <Table2 size={15} aria-hidden="true" /> Excel XLSX
      </a>
    </div>
  );
}
