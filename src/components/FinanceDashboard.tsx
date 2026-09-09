import { RoleIntelligenceHome, type IntelligenceInsight } from "@/components/RoleIntelligenceHome";

type FinanceStats = {
  invoices: number;
  payments: number;
  pendingFeeAdjustments: number;
  feeItems: number;
  students: number;
};

type Props = { name: string; school: string; code: string; role: string; stats: FinanceStats };

export function FinanceDashboard({ name, school, code, role, stats }: Props) {
  const firstName = name.trim().split(/\s+/)[0] || name;
  const insights: IntelligenceInsight[] = [];

  if (stats.pendingFeeAdjustments > 0) {
    insights.push({
      title: "Fee adjustments are waiting for approval",
      detail: `${stats.pendingFeeAdjustments} adjustment${stats.pendingFeeAdjustments === 1 ? "" : "s"} still need review before the fee ledger is fully settled.`,
      href: "/school/fees/overview",
      actionLabel: "Review",
      severity: "warning",
    });
  }
  if (stats.feeItems === 0) {
    insights.push({
      title: "The school has no fee structure yet",
      detail: "Create fee items before issuing reliable learner invoices for the current term.",
      href: "/school/fees",
      actionLabel: "Set up fees",
      severity: "critical",
    });
  }
  if (stats.invoices > 0 && stats.payments === 0) {
    insights.push({
      title: "Invoices exist but no payments have been recorded",
      detail: "Open collections and confirm whether receipts still need to be posted or reconciled.",
      href: "/school/fees/payments",
      actionLabel: "Open payments",
      severity: "warning",
    });
  }
  if (stats.payments > 0) {
    insights.push({
      title: "Collection activity is flowing through the system",
      detail: `${stats.payments} payment record${stats.payments === 1 ? " is" : "s are"} available for receipts, reconciliation and reporting.`,
      href: "/school/fees/payments",
      actionLabel: "Review",
      severity: "positive",
    });
  }

  return <RoleIntelligenceHome
    eyebrow={`Finance intelligence · ${role}`}
    title={`Good morning, ${firstName}. Know what the money workflow needs next.`}
    description="This home is focused on collections, fee setup, approvals and finance exceptions instead of general school administration."
    identity={`${school} · ${code}`}
    primaryAction={{ label: "Record payment", href: "/school/fees/payments" }}
    secondaryAction={{ label: "Finance reports", href: "/school/fees/reports" }}
    metrics={[
      { label: "Invoice records", value: stats.invoices, detail: "Invoices currently in the school ledger.", href: "/school/fees/invoices" },
      { label: "Payment records", value: stats.payments, detail: "Collections and receipts captured in SukuuNova.", href: "/school/fees/payments", tone: stats.payments > 0 ? "good" : "warn" },
      { label: "Adjustments pending", value: stats.pendingFeeAdjustments, detail: "Exceptions still waiting for approval.", href: "/school/fees/overview", tone: stats.pendingFeeAdjustments > 0 ? "warn" : "good" },
      { label: "Fee items", value: stats.feeItems, detail: `${stats.students} learner${stats.students === 1 ? "" : "s"} can be billed from the configured structure.`, href: "/school/fees", tone: stats.feeItems > 0 ? "good" : "critical" },
    ]}
    insights={insights}
    focusTitle="Finance focus"
    focusDescription="A compact view of the records that drive collections and reconciliation."
    focus={[
      { label: "Collections", detail: "Review posted payments and generate receipts.", value: `${stats.payments}`, href: "/school/fees/payments" },
      { label: "Billing", detail: "Open learner invoices and outstanding balances.", value: `${stats.invoices}`, href: "/school/fees/invoices" },
      { label: "Approval queue", detail: "Resolve fee changes that still need a second review.", value: `${stats.pendingFeeAdjustments}`, href: "/school/fees/overview" },
      { label: "Fee structure", detail: "Keep school charges and billing items current.", value: `${stats.feeItems}`, href: "/school/fees" },
    ]}
    actions={[
      { label: "Record payment", detail: "Post a collection against an invoice.", href: "/school/fees/payments" },
      { label: "Find invoice", detail: "Search learner and term invoices.", href: "/school/fees/invoices" },
      { label: "Finance reports", detail: "Review collections, balances and trends.", href: "/school/fees/reports" },
      { label: "Payroll", detail: "Open payroll when your role permits it.", href: "/school/fees/payroll" },
    ]}
  />;
}

export const financeDashboardStyles = "";
