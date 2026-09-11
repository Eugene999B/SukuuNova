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

export default function FinanceDownloadCenter({ mode, canExport }: { mode: string; canExport: boolean }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/mvp/finance", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || body.error || "Finance receipts could not be loaded.");
        if (active) setData(body as FinanceData);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Finance receipts could not be loaded.");
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
  const recent = (data?.payments || []).slice(0, mode === "payments" ? 12 : 6);
  const outstanding = ledger.reduce((sum, row) => sum + row.due, 0);

  const exportCard = (
    href: string,
    icon: React.ReactNode,
    title: string,
    detail: string,
  ) => canExport ? (
    <a href={href}>
      <span>{icon}</span>
      <div><strong>{title}</strong><small>{detail}</small></div>
      <Download size={16} />
    </a>
  ) : (
    <button type="button" disabled title="Your role does not have finance export permission.">
      <span>{icon}</span>
      <div><strong>{title}</strong><small>Export permission required</small></div>
      <Download size={16} />
    </button>
  );

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
            <b>{canExport ? "Export access verified" : "Viewing access only"}</b>
            <small>{canExport ? "Bulk downloads are checked server-side against exports:finance." : "Receipts remain available, but bulk financial exports require exports:finance."}</small>
          </span>
        </div>
      </header>

      <div className="fdc-downloads">
        {exportCard(
          "/api/school/exports/fees",
          <FileSpreadsheet size={18} />,
          "Finance ledger CSV",
          `${ledger.length} invoice records`,
        )}
        {exportCard(
          "/api/school/exports/payments",
          <ReceiptText size={18} />,
          "Payments CSV",
          `${data?.payments.length || 0} payment records`,
        )}
        {exportCard(
          "/api/school/exports/arrears",
          <WalletCards size={18} />,
          "Arrears CSV",
          `${money(outstanding)} outstanding`,
        )}
      </div>

      {error ? <div className="fdc-error">{error}</div> : null}

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
          <div className="fdc-empty">{data ? "Receipts will appear here as soon as payments are recorded." : "Loading recent receipts…"}</div>
        )}
      </div>
    </section>
  );
}
