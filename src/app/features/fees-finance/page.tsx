import "../capability.css";
import { MarketingCapabilityPage } from "@/components/MarketingCapabilityPage";

export default function FeesFinanceFeaturePage() {
  return (
    <MarketingCapabilityPage
      eyebrow="Fees & finance"
      title="Make the money story easier to follow from charge to receipt."
      intro="Fees, invoices, payments, arrears and receipts should tell one consistent financial story. SukuuNova keeps the operational side of school finance connected so teams can act with confidence."
      accent="#1d4774"
      workspaceHref="/school/fees"
      workspaceLabel="Open Finance"
      sections={[
        { title: "Set expectations clearly", body: "Keep fee structures and charges connected to the school context that created them." },
        { title: "Invoices stay traceable", body: "See what was billed, for whom and why without rebuilding the story across spreadsheets." },
        { title: "Payments update the picture", body: "Record collections and receipts against the right financial record so balances stay meaningful." },
        { title: "Arrears become actionable", body: "See outstanding balances as a working queue for follow-up rather than a disconnected report." },
        { title: "Payroll fits the same workspace", body: "Keep payroll operations beside the broader finance workflow without confusing the two records." },
        { title: "Evidence is easy to find", body: "Keep finance evidence and reporting close to the underlying records so review and accountability are simpler." },
      ]}
      outcomes={[
        "Fewer competing versions of a learner balance",
        "Clearer invoice and payment history",
        "More actionable arrears follow-up",
        "A calmer path from collection to evidence and reporting",
      ]}
    />
  );
}
