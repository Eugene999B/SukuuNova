import { redirect } from "next/navigation";

export default function FinanceRoute({ mode }: { mode: "overview" | "fees" | "invoices" | "payments" | "arrears" | "reports" }) {
  if (mode === "payments") redirect("/school/finance/payments");
  if (mode === "reports") redirect("/school/finance/reports");
  if (mode === "arrears" || mode === "invoices") redirect("/school/finance/history");
  if (mode === "fees") redirect("/school/finance/fees");
  redirect("/school/finance");
}
