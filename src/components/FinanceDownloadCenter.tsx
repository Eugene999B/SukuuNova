"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import "./finance-download-center.css";

type Invoice = {
  id: string;
  totalAmount: number | string;
  status: string;
  student?: { name?: string; admissionNo?: string } | null;
  term?: { name?: string } | null;
};

type Payment = {
  id: string;
  invoiceId: string;
  amount: number | string;
  method: string;
  reference?: string | null;
  createdAt: string;
};

type Reversal = {
  id: string;
  paymentId: string;
  amount: number | string;
  reason?: string | null;
  createdAt?: string;
};

type FinanceData = {
  invoices: Invoice[];
  payments: Payment[];
  reversals: Reversal[];
};

type LedgerRow = Invoice & {
  billed: number;
  paid: number;
  due: number;
};

const amount = (value: unknown) => Number(value || 0);
const money = (value: number) =>
  `GHS ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) =>
  new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeZone: "Africa/Accra" }).format(new Date(value));
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function FinanceDownloadCenter({ mode }: { mode: string }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/mvp/finance", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || body.error || "Finance exports could not be loaded.");
        if (active) setData(body as FinanceData);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Finance exports could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  const reversalByPayment = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data?.reversals || []) {
      map.set(row.paymentId, (map.get(row.paymentId) || 0) + amount(row.amount));
    }
    return map;
  }, [data]);

  const netPayment = (payment: Payment) => Math.max(0, amount(payment.amount) - (reversalByPayment.get(payment.id) || 0));

  const ledger = useMemo<LedgerRow[]>(() => {
    const paid = new Map<string, number>();
    for (const payment of data?.payments || []) {
      paid.set(payment.invoiceId, (paid.get(payment.invoiceId) || 0) + netPayment(payment));
    }
    return (data?.invoices || []).map((invoice) => {
      const billed = amount(invoice.totalAmount);
      const received = paid.get(invoice.id) || 0;
      return { ...invoice, billed, paid: received, due: Math.max(0, billed - received) };
    });
  }, [data, reversalByPayment]);

  const invoiceById = useMemo(() => new Map((data?.invoices || []).map((invoice) => [invoice.id, invoice])), [data]);
  const dateStamp = new Date().toISOString().slice(0, 10);

  function exportLedger() {
    downloadCsv(
      `sukuunova-finance-ledger-${dateStamp}.csv`,
      ["Invoice ID", "Student", "Admission No", "Term", "Billed (GHS)", "Net Paid (GHS)", "Outstanding (GHS)", "Status"],
      ledger.map((row) => [
        row.id,
        row.student?.name || "",
        row.student?.admissionNo || "",
        row.term?.name || "",
        row.billed.toFixed(2),
        row.paid.toFixed(2),
        row.due.toFixed(2),
        row.due <= 0 ? "Paid" : row.paid > 0 ? "Part paid" : row.status,
      ]),
    );
  }

  function exportPayments() {
    downloadCsv(
      `sukuunova-payments-${dateStamp}.csv`,
      ["Payment ID", "Invoice ID", "Student", "Admission No", "Date", "Method", "Reference", "Gross (GHS)", "Reversed (GHS)", "Net (GHS)"],
      (data?.payments || []).map((payment) => {
        const invoice = invoiceById.get(payment.invoiceId);
        const reversed = reversalByPayment.get(payment.id) || 0;
        return [
          payment.id,
          payment.invoiceId,
          invoice?.student?.name || "",
          invoice?.student?.admissionNo || "",
          date(payment.createdAt),
          payment.method,
          payment.reference || "",
          amount(payment.amount).toFixed(2),
          reversed.toFixed(2),
          netPayment(payment).toFixed(2),
        ];
      }),
    );
  }

  function exportArrears() {
    downloadCsv(
      `sukuunova-arrears-${dateStamp}.csv`,
      ["Invoice ID", "Student", "Admission No", "Term", "Billed (GHS)", "Net Paid (GHS)", "Outstanding (GHS)"],
      ledger
        .filter((row) => row.due > 0)
        .sort((a, b) => b.due - a.due)
        .map((row) => [
          row.id,
          row.student?.name || "",
          row.student?.admissionNo || "",
          row.term?.name || "",
          row.billed.toFixed(2),
          row.paid.toFixed(2),
          row.due.toFixed(2),
        ]),
    );
  }

  if (error) {
    return <section className="fdc-error">{error}</section>;
  }

  const recent = (data?.payments || []).slice(0, mode === "payments" ? 12 : 6);
  const outstanding = ledger.reduce((sum, row) => sum + row.due, 0);

  return (
    <section className="fdc-shell" aria-label="Finance downloads and receipts">
      <header className="fdc-head">
        <div>
          <span>DOWNLOAD & RECEIPT CENTER</span>
          <h2>Take the finance record with you.</h2>
          <p>
            Export clean ledger data for reconciliation, reporting and follow-up. Open any recent payment as an
            official printable receipt without leaving the Finance workspace.
          </p>
        </div>
        <div className="fdc-trust">
          <ShieldCheck size={18} />
          <span>
            <b>Permission-scoped</b>
            <small>Exports use the same finance:read tenant boundary as the live ledger.</small>
          </span>
        </div>
      </header>

      <div className="fdc-downloads">
        <button type="button" onClick={exportLedger} disabled={!data}>
          <span><FileSpreadsheet size={18} /></span>
          <div><strong>Finance ledger CSV</strong><small>{ledger.length} invoice records</small></div>
          <Download size={16} />
        </button>
        <button type="button" onClick={exportPayments} disabled={!data}>
          <span><ReceiptText size={18} /></span>
          <div><strong>Payments CSV</strong><small>{data?.payments.length || 0} payment records</small></div>
          <Download size={16} />
        </button>
        <button type="button" onClick={exportArrears} disabled={!data}>
          <span><WalletCards size={18} /></span>
          <div><strong>Arrears CSV</strong><small>{money(outstanding)} outstanding</small></div>
          <Download size={16} />
        </button>
      </div>

      <div className="fdc-receipts">
        <div className="fdc-receipts-head">
          <div><span>RECENT RECEIPTS</span><h3>Open, print or save official payment records</h3></div>
          <small>{recent.length ? `${recent.length} recent payment${recent.length === 1 ? "" : "s"}` : "No payments yet"}</small>
        </div>
        {recent.length ? (
          <div className="fdc-receipt-grid">
            {recent.map((payment) => {
              const invoice = invoiceById.get(payment.invoiceId);
              const reversed = reversalByPayment.get(payment.id) || 0;
              return (
                <Link key={payment.id} href={`/school/fees/receipt/${encodeURIComponent(payment.id)}`}>
                  <span className="fdc-receipt-icon"><ReceiptText size={16} /></span>
                  <div>
                    <strong>{invoice?.student?.name || "Student payment"}</strong>
                    <small>{date(payment.createdAt)} · {payment.reference || payment.id.slice(-8).toUpperCase()}</small>
                  </div>
                  <aside>
                    <b>{money(netPayment(payment))}</b>
                    {reversed > 0 ? <small>{money(reversed)} reversed</small> : <small>{payment.method.toUpperCase()}</small>}
                  </aside>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="fdc-empty">Receipts will appear here as soon as payments are recorded.</div>
        )}
      </div>
    </section>
  );
}
