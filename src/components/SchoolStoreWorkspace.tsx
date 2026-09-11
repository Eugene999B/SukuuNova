"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, BadgeDollarSign, Boxes, ChevronRight, CircleAlert, Download, FileSpreadsheet, FileText, History, PackagePlus, Plus, Printer, ReceiptText, RefreshCw, Search, ShoppingCart, SlidersHorizontal, Store, UserRound, X } from "lucide-react";
import "./school-store-workspace.css";

type Variant = { id: string; productId: string; sku: string; size: string | null; color: string | null; barcode: string | null; price: number; costPrice: number | null; stockQuantity: number; reorderLevel: number; status: string };
type Product = { id: string; name: string; sku: string; category: string | null; description: string | null; status: string; variants: Variant[] };
type Sale = { id: string; receiptNo: string; customerType: string; customerName: string; customerPhone: string | null; paymentMethod: string; paymentReference: string | null; subtotal: number; discount: number; total: number; status: string; createdAt: string; voidedAt: string | null; voidReason: string | null };
type Student = { id: string; name: string; admissionNo: string; class: { name: string } | null };
type Guardian = { id: string; name: string; phone: string | null; email: string | null };
type StoreData = {
  access: Record<"store:view" | "store:manage_catalog" | "store:stock" | "store:sell" | "store:void_sale" | "store:export", boolean>;
  products: Product[];
  sales: Sale[];
  topProducts: Array<{ productName: string; units: number; value: number }>;
  metrics: { units: number; lowStock: number; stockValue: number; todayTransactions: number; todaySales: number };
  students: Student[];
  guardians: Guardian[];
};
type Mode = "overview" | "products" | "sell" | "history";
type VariantDraft = { key: string; sku: string; size: string; color: string; barcode: string; price: string; costPrice: string; openingStock: string; reorderLevel: string };
type CartLine = { variantId: string; quantity: number };
type JsonResponse = { ok?: boolean; result?: { saleId?: string; receiptNo?: string; total?: number }; message?: string; error?: string };

const money = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" });
const initialVariant = (): VariantDraft => ({ key: crypto.randomUUID(), sku: "", size: "", color: "", barcode: "", price: "", costPrice: "", openingStock: "0", reorderLevel: "2" });

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as JsonResponse;
  try { return JSON.parse(text) as JsonResponse; } catch { return {} as JsonResponse; }
}

function variantLabel(variant: Variant) {
  return [variant.size, variant.color].filter(Boolean).join(" / ") || "Standard";
}

export default function SchoolStoreWorkspace() {
  const [data, setData] = useState<StoreData | null>(null);
  const [mode, setMode] = useState<Mode>("overview");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<"product" | "restock" | "void" | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/school/store", { cache: "no-store" });
      const payload = await response.json() as StoreData & { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not load the school store.");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the school store.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  async function mutate(body: Record<string, unknown>) {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/school/store", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.message || payload.error || "The store action could not be completed.");
      await load();
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The store action could not be completed.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <div className="store-loading"><RefreshCw size={20} className="spin" /> Loading store workspace…</div>;
  if (!data) return <div className="store-failure"><CircleAlert size={28} /><h2>School Store could not load</h2><p>{error || "Please try again."}</p><button type="button" onClick={() => void load()}>Try again</button></div>;

  const lowStock = data.products.flatMap((product) => product.variants.map((variant) => ({ product, variant }))).filter(({ variant }) => variant.status === "active" && variant.stockQuantity <= variant.reorderLevel);

  return <main className="store-workspace">
    <section className="store-hero">
      <div className="store-hero-copy"><span className="store-eyebrow">SCHOOL RETAIL OPERATIONS</span><h1>One clean counter for stock, sales and receipts.</h1><p>Uniforms, books, stationery and every saleable school item stay grouped by product, size and variant. Complete a sale once and SukuuNova updates stock, customer history and the receipt automatically.</p></div>
      <div className="store-hero-actions">
        {data.access["store:sell"] ? <button type="button" className="store-primary" onClick={() => setMode("sell")}><ShoppingCart size={16} /> New sale</button> : null}
        {data.access["store:manage_catalog"] ? <button type="button" className="store-secondary" onClick={() => setPanel("product")}><PackagePlus size={16} /> Add product</button> : null}
      </div>
    </section>

    <section className="store-metrics" aria-label="Store summary">
      <article><Boxes size={18} /><span><small>Units in stock</small><strong>{data.metrics.units.toLocaleString()}</strong><p>{data.products.length} grouped products</p></span></article>
      <article className={data.metrics.lowStock ? "needs-attention" : ""}><CircleAlert size={18} /><span><small>Low-stock variants</small><strong>{data.metrics.lowStock}</strong><p>At or below reorder point</p></span></article>
      <article><BadgeDollarSign size={18} /><span><small>Today’s sales</small><strong>{money.format(data.metrics.todaySales)}</strong><p>{data.metrics.todayTransactions} transactions</p></span></article>
      <article><Archive size={18} /><span><small>Stock value</small><strong>{money.format(data.metrics.stockValue)}</strong><p>Using cost where available</p></span></article>
    </section>

    <nav className="store-tabs" aria-label="School store sections">
      {([ ["overview","Overview"], ["products","Products & stock"], ["sell","New sale"], ["history","Sales history"] ] as Array<[Mode,string]>).map(([key, label]) => <button key={key} type="button" className={mode === key ? "active" : ""} onClick={() => setMode(key)}>{label}</button>)}
    </nav>

    {message ? <div className="store-banner success">{message}</div> : null}
    {error ? <div className="store-banner error"><CircleAlert size={16} /> {error}</div> : null}

    {mode === "overview" ? <StoreOverview data={data} lowStock={lowStock} onRestock={(variant) => { setSelectedVariant(variant); setPanel("restock"); }} onSell={() => setMode("sell")} /> : null}
    {mode === "products" ? <ProductsView data={data} onAdd={() => setPanel("product")} onRestock={(variant) => { setSelectedVariant(variant); setPanel("restock"); }} /> : null}
    {mode === "sell" ? <SaleDesk data={data} saving={saving} onSale={async (payload) => {
      const result = await mutate(payload);
      if (result?.result?.saleId) {
        setMessage(`Sale ${result.result.receiptNo ?? ""} completed successfully.`);
        return result.result;
      }
      return null;
    }} /> : null}
    {mode === "history" ? <SalesHistory data={data} onVoid={(sale) => { setSelectedSale(sale); setPanel("void"); }} /> : null}

    {panel === "product" ? <ProductPanel saving={saving} onClose={() => setPanel(null)} onSubmit={async (body) => { const result = await mutate(body); if (result) { setPanel(null); setMessage("Product and size variants added to the store."); } }} /> : null}
    {panel === "restock" && selectedVariant ? <RestockPanel variant={selectedVariant} saving={saving} onClose={() => { setPanel(null); setSelectedVariant(null); }} onSubmit={async (body) => { const result = await mutate(body); if (result) { setPanel(null); setSelectedVariant(null); setMessage("Stock was updated and the movement was recorded."); } }} /> : null}
    {panel === "void" && selectedSale ? <VoidPanel sale={selectedSale} saving={saving} onClose={() => { setPanel(null); setSelectedSale(null); }} onSubmit={async (body) => { const result = await mutate(body); if (result) { setPanel(null); setSelectedSale(null); setMessage("Sale was voided and its stock was restored."); } }} /> : null}
  </main>;
}

function StoreOverview({ data, lowStock, onRestock, onSell }: { data: StoreData; lowStock: Array<{ product: Product; variant: Variant }>; onRestock: (variant: Variant) => void; onSell: () => void }) {
  return <div className="store-overview-grid">
    <section className="store-card span-two"><header><div><span className="store-card-kicker">COUNTER</span><h2>Ready for the next sale</h2><p>Choose the customer once, build the cart and print a formal receipt after payment.</p></div>{data.access["store:sell"] ? <button type="button" className="store-primary compact" onClick={onSell}>Open sales desk <ChevronRight size={15} /></button> : null}</header>
      <div className="store-process"><span><b>1</b>Select buyer</span><span><b>2</b>Add exact size</span><span><b>3</b>Confirm payment</span><span><b>4</b>Print receipt</span></div>
    </section>
    <section className="store-card"><header><div><span className="store-card-kicker">STOCK WATCH</span><h2>Needs attention</h2></div></header>
      <div className="store-list">{lowStock.slice(0, 6).map(({ product, variant }) => <div className="store-list-row" key={variant.id}><span><strong>{product.name}</strong><small>{variantLabel(variant)} · {variant.sku}</small></span><b>{variant.stockQuantity}</b>{data.access["store:stock"] ? <button type="button" onClick={() => onRestock(variant)}>Restock</button> : null}</div>)}{!lowStock.length ? <div className="store-empty-inline">No variant is below its reorder point.</div> : null}</div>
    </section>
    <section className="store-card"><header><div><span className="store-card-kicker">30 DAYS</span><h2>Top products</h2></div></header>
      <div className="store-ranking">{data.topProducts.map((item, index) => <div key={item.productName}><span className="rank">{index + 1}</span><span><strong>{item.productName}</strong><small>{item.units} units sold</small></span><b>{money.format(item.value)}</b></div>)}{!data.topProducts.length ? <div className="store-empty-inline">Sales trends will appear after transactions are recorded.</div> : null}</div>
    </section>
    <section className="store-card span-two"><header><div><span className="store-card-kicker">RECENT ACTIVITY</span><h2>Latest transactions</h2></div><Link href="/school/store?view=history" className="store-text-link">Full history</Link></header>
      <div className="store-table-wrap"><table><thead><tr><th>Receipt</th><th>Customer</th><th>Payment</th><th>Total</th><th>Status</th><th /></tr></thead><tbody>{data.sales.slice(0, 8).map((sale) => <tr key={sale.id}><td><strong>{sale.receiptNo}</strong><small>{dateTime.format(new Date(sale.createdAt))}</small></td><td>{sale.customerName}</td><td>{sale.paymentMethod}</td><td>{money.format(sale.total)}</td><td><span className={`store-status ${sale.status}`}>{sale.status}</span></td><td><Link href={`/school/store/receipt/${sale.id}`}>Receipt</Link></td></tr>)}</tbody></table>{!data.sales.length ? <div className="store-table-empty">No store sale has been recorded yet.</div> : null}</div>
    </section>
  </div>;
}

function ProductsView({ data, onAdd, onRestock }: { data: StoreData; onAdd: () => void; onRestock: (variant: Variant) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = [...new Set(data.products.map((product) => product.category).filter((value): value is string => Boolean(value)))].sort();
  const filtered = data.products.filter((product) => {
    const haystack = [product.name, product.sku, product.category ?? "", ...product.variants.flatMap((variant) => [variant.sku, variant.size ?? "", variant.color ?? ""])].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (category === "all" || product.category === category);
  });
  return <section className="store-section">
    <header className="store-section-head"><div><span className="store-card-kicker">CATALOG</span><h2>Products & stock</h2><p>One product can contain many sizes, colours or pack variants without cluttering the catalog.</p></div>{data.access["store:manage_catalog"] ? <button type="button" className="store-primary" onClick={onAdd}><Plus size={15} /> Add product</button> : null}</header>
    <div className="store-filterbar"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, SKU, size…" /></label><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><span>{filtered.length} products</span></div>
    <div className="store-product-grid">{filtered.map((product) => <article className="store-product-card" key={product.id}><header><span className="store-product-icon"><Store size={18} /></span><div><h3>{product.name}</h3><p>{product.category || "Uncategorised"} · {product.sku}</p></div><span className={`store-status ${product.status}`}>{product.status}</span></header>{product.description ? <p className="store-product-description">{product.description}</p> : null}<div className="store-variant-list">{product.variants.map((variant) => <div key={variant.id} className={variant.stockQuantity <= variant.reorderLevel ? "low" : ""}><span><strong>{variantLabel(variant)}</strong><small>{variant.sku} · {money.format(variant.price)}</small></span><span className="store-stock-count"><b>{variant.stockQuantity}</b><small>in stock</small></span>{data.access["store:stock"] ? <button type="button" onClick={() => onRestock(variant)}>Restock</button> : null}</div>)}</div></article>)}{!filtered.length ? <div className="store-empty-card">No products match these filters.</div> : null}</div>
  </section>;
}

function SaleDesk({ data, saving, onSale }: { data: StoreData; saving: boolean; onSale: (payload: Record<string, unknown>) => Promise<{ saleId?: string; receiptNo?: string; total?: number } | null> }) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerType, setCustomerType] = useState<"student" | "guardian" | "external">("student");
  const [studentId, setStudentId] = useState("");
  const [guardianId, setGuardianId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [discount, setDiscount] = useState("0");
  const [lastSale, setLastSale] = useState<{ saleId?: string; receiptNo?: string; total?: number } | null>(null);
  const variants = useMemo(() => data.products.flatMap((product) => product.variants.map((variant) => ({ product, variant }))).filter(({ product, variant }) => product.status === "active" && variant.status === "active" && variant.stockQuantity > 0), [data]);
  const variantMap = useMemo(() => new Map(variants.map((entry) => [entry.variant.id, entry])), [variants]);
  const visible = variants.filter(({ product, variant }) => !query || [product.name, product.sku, variant.sku, variant.size ?? "", variant.color ?? ""].join(" ").toLowerCase().includes(query.toLowerCase())).slice(0, 30);
  const cartRows = cart.map((line) => ({ ...line, entry: variantMap.get(line.variantId) })).filter((line): line is CartLine & { entry: { product: Product; variant: Variant } } => Boolean(line.entry));
  const subtotal = cartRows.reduce((sum, line) => sum + line.entry.variant.price * line.quantity, 0);
  const numericDiscount = Math.min(Math.max(Number(discount || 0), 0), subtotal);
  const total = subtotal - numericDiscount;

  function add(variant: Variant) {
    setLastSale(null);
    setCart((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      if (existing) return current.map((line) => line.variantId === variant.id ? { ...line, quantity: Math.min(line.quantity + 1, variant.stockQuantity) } : line);
      return [...current, { variantId: variant.id, quantity: 1 }];
    });
  }
  function setQty(variant: Variant, quantity: number) {
    if (quantity <= 0) setCart((current) => current.filter((line) => line.variantId !== variant.id));
    else setCart((current) => current.map((line) => line.variantId === variant.id ? { ...line, quantity: Math.min(quantity, variant.stockQuantity) } : line));
  }

  async function complete() {
    const result = await onSale({ action: "sale", customerType, studentId: studentId || null, guardianId: guardianId || null, customerName: customerName || null, customerPhone: customerPhone || null, paymentMethod, paymentReference: paymentReference || null, discount: numericDiscount, lines: cart.map((line) => ({ variantId: line.variantId, quantity: line.quantity })) });
    if (result?.saleId) {
      setLastSale(result);
      setCart([]);
      setDiscount("0");
      setPaymentReference("");
    }
  }

  if (!data.access["store:sell"]) return <div className="store-failure inline"><CircleAlert size={24} /><h2>Sales desk is read-only</h2><p>Your account can view the store but cannot record sales. The school Owner can delegate <b>Record store sales</b> from Roles & Permissions.</p></div>;

  return <section className="store-sale-layout">
    <div className="store-card store-catalog-picker"><header><div><span className="store-card-kicker">1 · CART</span><h2>Choose exact items</h2><p>Add the correct size or variant. Out-of-stock items are hidden.</p></div></header><label className="store-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search uniforms, books, SKU or size…" /></label><div className="store-sale-products">{visible.map(({ product, variant }) => <button type="button" key={variant.id} onClick={() => add(variant)}><span><strong>{product.name}</strong><small>{variantLabel(variant)} · {variant.sku}</small></span><span><b>{money.format(variant.price)}</b><small>{variant.stockQuantity} available</small></span><Plus size={15} /></button>)}{!visible.length ? <div className="store-empty-inline">No sellable item matches your search.</div> : null}</div></div>
    <div className="store-sale-right">
      <div className="store-card"><header><div><span className="store-card-kicker">2 · BUYER</span><h2>Who is buying?</h2><p>Use existing school records when possible so customer history stays connected.</p></div></header><div className="store-segmented">{(["student","guardian","external"] as const).map((type) => <button key={type} type="button" onClick={() => setCustomerType(type)} className={customerType === type ? "active" : ""}>{type === "external" ? "Other customer" : type[0].toUpperCase() + type.slice(1)}</button>)}</div>{customerType === "student" ? <label className="store-field"><span>Student</span><select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Select student</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.admissionNo}{student.class ? ` · ${student.class.name}` : ""}</option>)}</select></label> : null}{customerType === "guardian" ? <label className="store-field"><span>Guardian</span><select value={guardianId} onChange={(event) => setGuardianId(event.target.value)}><option value="">Select guardian</option>{data.guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name}{guardian.phone ? ` · ${guardian.phone}` : ""}</option>)}</select></label> : null}{customerType === "external" ? <div className="store-field-grid"><label className="store-field"><span>Customer name</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label><label className="store-field"><span>Phone</span><input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label></div> : null}</div>
      <div className="store-card"><header><div><span className="store-card-kicker">3 · PAYMENT</span><h2>Review & complete</h2></div></header><div className="store-cart-list">{cartRows.map((line) => <div key={line.variantId}><span><strong>{line.entry.product.name}</strong><small>{variantLabel(line.entry.variant)} · {money.format(line.entry.variant.price)}</small></span><div className="store-qty"><button type="button" onClick={() => setQty(line.entry.variant, line.quantity - 1)}>−</button><b>{line.quantity}</b><button type="button" onClick={() => setQty(line.entry.variant, line.quantity + 1)}>+</button></div><b>{money.format(line.entry.variant.price * line.quantity)}</b></div>)}{!cartRows.length ? <div className="store-empty-inline">Your cart is empty.</div> : null}</div><div className="store-field-grid"><label className="store-field"><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Cash</option><option>Mobile Money</option><option>Bank Transfer</option><option>POS / Card</option><option>Cheque</option><option>Other</option></select></label><label className="store-field"><span>Reference (optional)</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label><label className="store-field"><span>Discount</span><input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label></div><div className="store-totals"><span>Subtotal <b>{money.format(subtotal)}</b></span><span>Discount <b>− {money.format(numericDiscount)}</b></span><strong>Total <b>{money.format(total)}</b></strong></div><button type="button" className="store-primary wide" disabled={saving || !cart.length || (customerType === "student" && !studentId) || (customerType === "guardian" && !guardianId) || (customerType === "external" && !customerName.trim())} onClick={() => void complete()}><ReceiptText size={16} /> {saving ? "Completing sale…" : "Complete sale & create receipt"}</button>{lastSale?.saleId ? <div className="store-sale-success"><ReceiptText size={20} /><span><strong>{lastSale.receiptNo} is ready.</strong><small>{money.format(Number(lastSale.total ?? 0))} recorded successfully.</small></span><Link href={`/school/store/receipt/${lastSale.saleId}`}>Open receipt</Link></div> : null}</div>
    </div>
  </section>;
}

function SalesHistory({ data, onVoid }: { data: StoreData; onVoid: (sale: Sale) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const methods = [...new Set(data.sales.map((sale) => sale.paymentMethod))].sort();
  const filtered = data.sales.filter((sale) => {
    const hit = !query || [sale.receiptNo, sale.customerName, sale.customerPhone ?? "", sale.paymentReference ?? ""].join(" ").toLowerCase().includes(query.toLowerCase());
    return hit && (status === "all" || sale.status === status) && (method === "all" || sale.paymentMethod === method);
  });
  return <section className="store-section"><header className="store-section-head"><div><span className="store-card-kicker">LEDGER</span><h2>Sales history</h2><p>Receipts, customer history and voids remain auditable. Records are never silently deleted.</p></div>{data.access["store:export"] ? <div className="store-export-actions"><a href="/api/school/store/export?format=xls"><FileSpreadsheet size={15} /> Excel</a><a href="/api/school/store/export?format=doc"><FileText size={15} /> Word</a><Link href="/school/store/history/print"><Printer size={15} /> PDF / print</Link></div> : null}</header><div className="store-filterbar"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Receipt, customer, phone or reference…" /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="completed">Completed</option><option value="void">Void</option></select><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="all">All payment methods</option>{methods.map((item) => <option key={item}>{item}</option>)}</select><span>{filtered.length} records</span></div><div className="store-table-wrap"><table><thead><tr><th>Date / Receipt</th><th>Customer</th><th>Payment</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((sale) => <tr key={sale.id}><td><strong>{sale.receiptNo}</strong><small>{dateTime.format(new Date(sale.createdAt))}</small></td><td><strong>{sale.customerName}</strong><small>{sale.customerType}</small></td><td>{sale.paymentMethod}<small>{sale.paymentReference || "No reference"}</small></td><td>{money.format(sale.total)}</td><td><span className={`store-status ${sale.status}`}>{sale.status}</span></td><td><div className="store-row-actions"><Link href={`/school/store/receipt/${sale.id}`}>Receipt</Link>{sale.status === "completed" && data.access["store:void_sale"] ? <button type="button" onClick={() => onVoid(sale)}>Void</button> : null}</div></td></tr>)}</tbody></table>{!filtered.length ? <div className="store-table-empty">No sales match the current filters.</div> : null}</div></section>;
}

function ProductPanel({ saving, onClose, onSubmit }: { saving: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(""); const [sku, setSku] = useState(""); const [category, setCategory] = useState(""); const [description, setDescription] = useState(""); const [variants, setVariants] = useState<VariantDraft[]>([initialVariant()]);
  function patch(key: string, field: keyof VariantDraft, value: string) { setVariants((current) => current.map((variant) => variant.key === key ? { ...variant, [field]: value } : variant)); }
  return <Panel title="Add store product" subtitle="Group sizes and variants under one product." onClose={onClose}><div className="store-panel-form"><div className="store-field-grid"><label className="store-field"><span>Product name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="School polo shirt" /></label><label className="store-field"><span>Product code / SKU</span><input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="POLO" /></label><label className="store-field"><span>Category</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Uniform" /></label></div><label className="store-field"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></label><div className="store-panel-section"><header><div><strong>Sizes & variants</strong><small>Each variant keeps its own price, stock and reorder level.</small></div><button type="button" onClick={() => setVariants((current) => [...current, initialVariant()])}><Plus size={14} /> Add variant</button></header>{variants.map((variant, index) => <div className="store-variant-editor" key={variant.key}><span className="variant-number">{index + 1}</span><input aria-label="Variant SKU" placeholder="SKU" value={variant.sku} onChange={(event) => patch(variant.key, "sku", event.target.value)} /><input aria-label="Size" placeholder="Size e.g. M" value={variant.size} onChange={(event) => patch(variant.key, "size", event.target.value)} /><input aria-label="Colour" placeholder="Colour" value={variant.color} onChange={(event) => patch(variant.key, "color", event.target.value)} /><input aria-label="Price" type="number" min="0" step="0.01" placeholder="Price" value={variant.price} onChange={(event) => patch(variant.key, "price", event.target.value)} /><input aria-label="Cost price" type="number" min="0" step="0.01" placeholder="Cost" value={variant.costPrice} onChange={(event) => patch(variant.key, "costPrice", event.target.value)} /><input aria-label="Opening stock" type="number" min="0" placeholder="Stock" value={variant.openingStock} onChange={(event) => patch(variant.key, "openingStock", event.target.value)} /><input aria-label="Reorder level" type="number" min="0" placeholder="Reorder" value={variant.reorderLevel} onChange={(event) => patch(variant.key, "reorderLevel", event.target.value)} />{variants.length > 1 ? <button type="button" className="remove" aria-label="Remove variant" onClick={() => setVariants((current) => current.filter((item) => item.key !== variant.key))}><X size={14} /></button> : null}</div>)}</div><div className="store-panel-actions"><button type="button" className="store-secondary" onClick={onClose}>Cancel</button><button type="button" className="store-primary" disabled={saving || !name.trim() || !sku.trim() || variants.some((variant) => !variant.sku.trim() || variant.price === "")} onClick={() => void onSubmit({ action: "createProduct", name, sku, category: category || null, description: description || null, variants: variants.map((variant) => ({ sku: variant.sku, size: variant.size || null, color: variant.color || null, barcode: variant.barcode || null, price: Number(variant.price), costPrice: variant.costPrice === "" ? null : Number(variant.costPrice), openingStock: Number(variant.openingStock || 0), reorderLevel: Number(variant.reorderLevel || 0) })) })}>{saving ? "Saving…" : "Create product"}</button></div></div></Panel>;
}

function RestockPanel({ variant, saving, onClose, onSubmit }: { variant: Variant; saving: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [quantity, setQuantity] = useState(""); const [unitCost, setUnitCost] = useState(variant.costPrice?.toString() ?? ""); const [notes, setNotes] = useState("");
  return <Panel title="Restock variant" subtitle={`${variantLabel(variant)} · ${variant.sku}`} onClose={onClose}><div className="store-panel-form"><div className="store-current-stock"><span>Current stock</span><strong>{variant.stockQuantity}</strong></div><label className="store-field"><span>Quantity received</span><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="store-field"><span>Unit cost (optional)</span><input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label><label className="store-field"><span>Supplier / delivery note</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Invoice, supplier or delivery reference…" /></label><div className="store-panel-actions"><button type="button" className="store-secondary" onClick={onClose}>Cancel</button><button type="button" className="store-primary" disabled={saving || Number(quantity) <= 0} onClick={() => void onSubmit({ action: "restock", variantId: variant.id, quantity: Number(quantity), unitCost: unitCost === "" ? null : Number(unitCost), notes: notes || null })}>{saving ? "Updating…" : "Add stock"}</button></div></div></Panel>;
}

function VoidPanel({ sale, saving, onClose, onSubmit }: { sale: Sale; saving: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [reason, setReason] = useState("");
  return <Panel title="Void sale" subtitle={`${sale.receiptNo} · ${money.format(sale.total)}`} onClose={onClose}><div className="store-panel-form"><div className="store-warning"><CircleAlert size={18} /><span><strong>This does not delete the transaction.</strong><small>The sale remains in history and the sold quantities are returned to stock.</small></span></div><label className="store-field"><span>Reason for voiding</span><textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this sale must be voided…" /></label><div className="store-panel-actions"><button type="button" className="store-secondary" onClick={onClose}>Cancel</button><button type="button" className="store-danger" disabled={saving || reason.trim().length < 3} onClick={() => void onSubmit({ action: "voidSale", saleId: sale.id, reason })}>{saving ? "Voiding…" : "Void sale & restore stock"}</button></div></div></Panel>;
}

function Panel({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="store-panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="store-panel" role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button></header>{children}</aside></div>;
}
