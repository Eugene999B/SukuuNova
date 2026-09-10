"use client";

import { useState } from "react";
import { ArrowRight, Boxes, CreditCard, FileCog, FilePlus2, LayoutList, MessageSquare, ReceiptText, ServerCog, WalletCards } from "lucide-react";
import PlatformAdvancedBillingRules from "@/components/PlatformAdvancedBillingRules";
import PlatformBillingStudio from "@/components/PlatformBillingStudio";
import PlatformInvoiceActions from "@/components/PlatformInvoiceActions";
import PlatformMessagingInventoryStudio from "@/components/PlatformMessagingInventoryStudio";
import PlatformMessagingProviderReadiness from "@/components/PlatformMessagingProviderReadiness";
import PlatformWorkflowDialog from "@/components/PlatformWorkflowDialog";
import BillingConsole from "./BillingConsole";

type School = { id: string; name: string; uniqueCode: string };

type Workflow = {
  id: "school" | "rules" | "invoice" | "inventory" | "provider" | "ledger";
  title: string;
  eyebrow: string;
  description: string;
  icon: typeof CreditCard;
  tone: string;
};

const workflows: Workflow[] = [
  { id: "school", title: "School billing", eyebrow: "01 · CONFIGURE", description: "Choose a school and set how its recurring SukuuNova subscription is calculated.", icon: CreditCard, tone: "Start here" },
  { id: "rules", title: "Invoice rules", eyebrow: "02 · CONTROL", description: "Set due dates, tax, discount, automation and invoice identity before issuing charges.", icon: FileCog, tone: "Policy" },
  { id: "invoice", title: "Generate invoice", eyebrow: "03 · ISSUE", description: "Create one auditable invoice from the school’s current saved commercial rules.", icon: FilePlus2, tone: "Action" },
  { id: "ledger", title: "Invoices & collections", eyebrow: "04 · RECONCILE", description: "Review outstanding balances, payments and collection performance across schools.", icon: ReceiptText, tone: "Ledger" },
  { id: "inventory", title: "Messaging inventory", eyebrow: "05 · FUND", description: "Record provider-backed purchases before allocating SMS or WhatsApp capacity to schools.", icon: Boxes, tone: "Prepaid" },
  { id: "provider", title: "Provider readiness", eyebrow: "06 · DELIVER", description: "Check whether delivery configuration is ready without exposing provider credentials.", icon: ServerCog, tone: "Health" },
];

export default function PlatformBillingHub({ schools }: { schools: School[] }) {
  const [open, setOpen] = useState<Workflow["id"] | null>(null);
  const active = workflows.find((workflow) => workflow.id === open);
  const close = () => setOpen(null);

  return <div className="platform-billing-v3 platform-billing-hub">
    <section className="platform-page-header platform-billing-hero">
      <div><span className="platform-eyebrow">Commercial operations</span><h2>Run billing as a workflow, not a collection of forms.</h2><p>Configure each school’s commercial basis, issue invoices from saved rules, reconcile collections, and manage messaging inventory as a separate prepaid business.</p></div>
      <div className="platform-header-actions"><span className="app-pill"><LayoutList size={14}/> 6 guided workflows</span></div>
    </section>

    <section className="platform-workflow-grid" aria-label="Billing workflows">
      {workflows.map((workflow, index) => {
        const Icon = workflow.icon;
        return <button type="button" key={workflow.id} className={`platform-workflow-card ${index === 0 ? "is-primary" : ""}`} onClick={() => setOpen(workflow.id)}><div className="platform-workflow-card-top"><span className="platform-workflow-icon"><Icon size={18}/></span><span className="app-pill">{workflow.tone}</span></div><span className="platform-eyebrow">{workflow.eyebrow}</span><h3>{workflow.title}</h3><p>{workflow.description}</p><span className="platform-workflow-open">Open workflow <ArrowRight size={14}/></span></button>;
      })}
    </section>

    <section className="platform-billing-guide app-card app-panel" aria-label="Billing sequence">
      <div className="platform-billing-guide-step"><span>1</span><div><strong>Configure</strong><small>Set the school’s commercial basis and invoice policy.</small></div></div>
      <div className="platform-billing-guide-step"><span>2</span><div><strong>Issue</strong><small>Generate invoices from the saved rules.</small></div></div>
      <div className="platform-billing-guide-step"><span>3</span><div><strong>Reconcile</strong><small>Record payments against specific invoices.</small></div></div>
      <div className="platform-billing-guide-step"><span>4</span><div><strong>Fund messaging</strong><small>Purchase provider capacity, then allocate credits.</small></div></div>
    </section>

    <PlatformWorkflowDialog open={open === "school"} onClose={close} eyebrow={active?.eyebrow} title="Configure school billing" description="Set the recurring subscription basis for one school. Messaging credits are managed separately."><PlatformBillingStudio /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "rules"} onClose={close} eyebrow={active?.eyebrow} title="Invoice rules" description="Control timing and invoice behaviour without changing the school’s pricing model."><PlatformAdvancedBillingRules schools={schools} /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "invoice"} onClose={close} eyebrow={active?.eyebrow} title="Generate an invoice" description="Create the invoice from the school’s current saved billing rules and preserve its calculation basis."><PlatformInvoiceActions schools={schools} /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "inventory"} onClose={close} eyebrow={active?.eyebrow} title="Messaging inventory" description="Record provider-backed SMS/WhatsApp purchases before allocating credits to schools."><PlatformMessagingInventoryStudio /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "provider"} onClose={close} eyebrow={active?.eyebrow} title="Provider readiness" description="Verify delivery configuration while keeping credentials server-side."><PlatformMessagingProviderReadiness /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "ledger"} onClose={close} eyebrow={active?.eyebrow} title="Invoices & collections" description="Search the commercial network, inspect invoice balances and reconcile payments."><BillingConsole /></PlatformWorkflowDialog>

    <section className="platform-billing-note app-card app-panel">
      <span className="platform-billing-note-title">Keep subscription revenue and messaging inventory separate</span>
      <span><WalletCards size={18}/></span><div><strong>Platform subscription</strong><p>Recurring charges for the SukuuNova service belong to invoices, collections and school commercial rules.</p></div>
      <span><MessageSquare size={18}/></span><div><strong>Messaging capacity</strong><p>SMS and WhatsApp credits are prepaid provider-backed inventory. Purchasing and allocation must remain traceable separately.</p></div>
    </section>
  </div>;
}
