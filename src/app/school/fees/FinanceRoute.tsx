import FinanceV2Route from "../finance/FinanceV2Route";

export default function FinanceRoute({ mode }: { mode: "overview" | "fees" | "invoices" | "payments" | "arrears" | "reports" }) {
  const target = mode === "payments"
    ? "payments"
    : mode === "reports"
      ? "reports"
      : mode === "arrears" || mode === "invoices"
        ? "history"
        : mode === "fees"
          ? "fees"
          : "dashboard";
  return <FinanceV2Route mode={target} />;
}
