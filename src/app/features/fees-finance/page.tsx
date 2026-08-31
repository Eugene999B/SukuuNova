import "../capability.css";
import { MarketingCapabilityPage } from "@/components/MarketingCapabilityPage";

export default function FeesFinanceFeaturePage() {
  return <MarketingCapabilityPage eyebrow="Fees & finance" title="Know what was billed, what was paid and what is still due." intro="Keep fees, invoices, payments and receipts together so the school can answer money questions without hunting through separate records." accent="#1d4774" workspaceHref="/school/fees" workspaceLabel="Finance" sections={[
    { title: "Set the fee", body: "Keep the charges the school has agreed on clear and tied to the right learner or family." },
    { title: "Send the invoice", body: "Create a financial record that shows what is due, when it is due and who it belongs to." },
    { title: "Record the payment", body: "Enter collections against the right invoice so the balance changes with the real transaction." },
    { title: "See what is still due", body: "Outstanding balances become a list the finance team can work through, not a number buried in a report." },
    { title: "Keep the receipt and history", body: "Leave the school with a clear trail of invoices, payments and receipts that can be checked later." },
  ]} outcomes={["A clear view of each balance", "Fewer payment and invoice mix-ups", "A useful follow-up list for outstanding fees", "Receipts and history close to the transaction"]} />;
}
