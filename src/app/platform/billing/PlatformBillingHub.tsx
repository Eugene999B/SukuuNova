"use client";

import { useState } from "react";
import { ArrowRight, Boxes, Calculator, CreditCard, FileCog, FilePlus2, LayoutList, MessageSquare, ReceiptText, ServerCog, WalletCards } from "lucide-react";
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
  { id: "school", title: "School billing", eyebrow: "01 · CONFIGURE", description: "Choose a school and set how its subscription is calculated.", icon: CreditCard, tone: "Start here" },
  { id: "rules", title: "Invoice rules", eyebrow: "02 · CONTROL", description: "Set due dates, tax, discount, automation and invoice identity.", icon: FileCog, tone: "Policy" },
  { id: "invoice", title: "Generate invoice", eyebrow: "03 · ISSUE", description: "Create one auditable invoice from the school’s current rules.", icon: FilePlus2, tone: "Action" },
  { id: "inventory", title: "Messaging inventory", eyebrow: "04 · FUND", description: "Record provider purchases before allocating SMS/WhatsApp capacity.", icon: Boxes, tone: "Prepaid" },
  { id: "provider", title: "Provider readiness", eyebrow: "05 · DELIVER", description: "Check whether SMS and WhatsApp delivery configuration is ready.", icon: ServerCog, tone: "Health" },
  { id: "ledger", title: "Invoices & collections", eyebrow: "06 · RECONCILE", description: "Review outstanding invoices, payments and collection performance.", icon: ReceiptText, tone: "Ledger" },
];

export default function PlatformBillingHub({ schools }: { schools: School[] }) {
  const [open, setOpen] = useState<Workflow["id"] | null>(null);
  const active = workflows.find((workflow) => workflow.id === open);
  const close = () => setOpen(null);
  return <div className="platform-billing-hub">
    <section className="platform-page-header platform-billing-hero">
      <div><span className="platform-eyebrow">Commercial operations</span><h2>What do you need to do?</h2><p>Billing is split into six simple workflows. Open only the task you need instead of navigating through one long configuration page.</p></div>
      <div className="platform-header-actions"><span className="app-pill"><LayoutList size={14}/> 6 guided workflows</span></div>
    </section>
    <section className="platform-workflow-grid" aria-label="Billing workflows">
      {workflows.map((workflow, index) => { const Icon = workflow.icon; return <button type="button" key={workflow.id} className={`platform-workflow-card ${index === 0 ? "is-primary" : ""}`} onClick={() => setOpen(workflow.id)}><div className="platform-workflow-card-top"><span className="platform-workflow-icon"><Icon size={17}/></span><span className="app-pill">{workflow.tone}</span></div><span className="platform-eyebrow">{workflow.eyebrow}</span><h3>{workflow.title}</h3><p>{workflow.description}</p><span className="platform-workflow-open">Open workflow <ArrowRight size={14}/></span></button>; })}
    </section>
    <section className="platform-billing-guide app-card app-panel">
      <div className="platform-billing-guide-step"><span>1</span><div><strong>Configure</strong><small>Set the school’s commercial basis.</small></div></div>
      <div className="platform-billing-guide-step"><span>2</span><div><strong>Issue</strong><small>Generate invoices from saved rules.</small></div></div>
      <div className="platform-billing-guide-step"><span>3</span><div><strong>Reconcile</strong><small>Record payments against invoices.</small></div></div>
      <div className="platform-billing-guide-step"><span>4</span><div><strong>Fund messaging</strong><small>Buy provider capacity, then allocate it.</small></div></div>
    </section>
    <PlatformWorkflowDialog open={open === "school"} onClose={close} eyebrow={active?.eyebrow} title="Configure school billing" description="Set the recurring subscription basis for one school. Messaging credits are managed separately."><PlatformBillingStudio /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "rules"} onClose={close} eyebrow={active?.eyebrow} title="Invoice rules" description="Control timing and invoice behaviour without changing the school’s pricing model."><PlatformAdvancedBillingRules schools={schools} /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "invoice"} onClose={close} eyebrow={active?.eyebrow} title="Generate an invoice" description="Create the invoice from the school’s current saved billing rules and preserve its calculation basis."><PlatformInvoiceActions schools={schools} /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "inventory"} onClose={close} eyebrow={active?.eyebrow} title="Messaging inventory" description="Record provider-backed SMS/WhatsApp purchases before allocating credits to schools."><PlatformMessagingInventoryStudio /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "provider"} onClose={close} eyebrow={active?.eyebrow} title="Provider readiness" description="Verify delivery configuration while keeping credentials server-side."><PlatformMessagingProviderReadiness /></PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={open === "ledger"} onClose={close} eyebrow={active?.eyebrow} title="Invoices & collections" description="Search the commercial network, inspect invoice balances and reconcile payments."><BillingConsole /></PlatformWorkflowDialog>
    <section className="app-card app-panel platform-billing-note"><WalletCards size={17}/><div><strong>Keep these two businesses separate</strong><span>School subscription billing pays for the SukuuNova platform. SMS/WhatsApp credits are prepaid communication capacity purchased from providers and resold to schools.</span></div><MessageSquare size={17}/></section>
  </div>;
}
