"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, BadgeDollarSign, Boxes, ChevronRight, CircleAlert, FileSpreadsheet, FileText, PackagePlus, Plus, Printer, ReceiptText, RefreshCw, Search, ShoppingCart, Store, X } from "lucide-react";
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
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="store-loading"><div className="store-spinner"/><strong>Opening School Store…</strong><span>Checking stock, sales and access.</span></div>;
  if (!data) return <div className="store-failure"><CircleAlert size={28}/><h2>Store unavailable</h2><p>{error || "The School Store could not be loaded."}</p><button onClick={() => void load()}>Try again</button></div>;

  const allVariants = data.products.flatMap((product) => product.variants.map((variant) => ({ ...variant, product })));
  const lowStock = allVariants.filter(({ status, stockQuantity, reorderLevel }) => status === "active" && stockQuantity <= reorderLevel).sort((a,b) => a.stockQuantity - b.stockQuantity);
  const recentSales = data.sales.slice(0, 6);
  const categories = new Set(data.products.map((product) => product.category || "Uncategorised"));

  return <div className="store-workspace">
    <div className="store-tabs" role="tablist" aria-label="School Store sections">
      {([['overview','Overview',Store],['products','Products & stock',Boxes],['sell','New sale',ShoppingCart],['history','Sales history',ReceiptText]] as const).map(([key,label,Icon]) => <button key={key} type="button" role="tab" aria-selected={mode===key} className={mode===key?"is-active":""} onClick={()=>setMode(key)}><Icon size={16}/>{label}</button>)}
    </div>

    {error ? <div className="store-notice is-error"><CircleAlert size={16}/><span>{error}</span><button onClick={()=>setError("")} aria-label="Dismiss"><X size={14}/></button></div> : null}
    {message ? <div className="store-notice is-success"><span>{message}</span><button onClick={()=>setMessage("")} aria-label="Dismiss"><X size={14}/></button></div> : null}

    {mode === "overview" ? <StoreOverview data={data} lowStock={lowStock} recentSales={recentSales} onMode={setMode} onRestock={(variant)=>{setSelectedVariant(variant);setPanel("restock");}}/> : null}
    {mode === "products" ? <StoreProducts data={data} canCreate={data.access["store:manage_catalog"]} canStock={data.access["store:stock"]} onCreate={()=>setPanel("product")} onRestock={(variant)=>{setSelectedVariant(variant);setPanel("restock");}} categories={[...categories]}/> : null}
    {mode === "sell" ? <StoreSaleDesk data={data} allVariants={allVariants} onComplete={(receiptNo)=>{setMessage(`Sale ${receiptNo} completed successfully.`);setMode("history");}} mutate={mutate}/> : null}
    {mode === "history" ? <StoreHistory data={data} onVoid={(sale)=>{setSelectedSale(sale);setPanel("void");}}/> : null}

    {panel === "product" ? <ProductPanel saving={saving} onClose={()=>setPanel(null)} mutate={mutate} onDone={()=>{setPanel(null);setMessage("Product and variants added to the store.");}}/> : null}
    {panel === "restock" && selectedVariant ? <RestockPanel variant={selectedVariant} saving={saving} onClose={()=>setPanel(null)} mutate={mutate} onDone={()=>{setPanel(null);setMessage(`${selectedVariant.sku} restocked successfully.`);}}/> : null}
    {panel === "void" && selectedSale ? <VoidPanel sale={selectedSale} saving={saving} onClose={()=>setPanel(null)} mutate={mutate} onDone={()=>{setPanel(null);setMessage(`${selectedSale.receiptNo} was voided and stock restored.`);}}/> : null}
  </div>;
}

function StoreOverview({ data, lowStock, recentSales, onMode, onRestock }: { data: StoreData; lowStock: Array<Variant & { product: Product }>; recentSales: Sale[]; onMode:(mode:Mode)=>void; onRestock:(variant:Variant)=>void }) {
  return <div className="store-overview">
    <section className="store-hero"><div><small>STORE CONTROL</small><h2>Today at the school store</h2><p>Sales, stock health and fast cashier actions without exposing every register at once.</p></div>{data.access["store:sell"] ? <button onClick={()=>onMode("sell")}><ShoppingCart size={17}/>Start a sale</button> : null}</section>
    <section className="store-kpis">
      <Metric icon={BadgeDollarSign} label="Sales today" value={money.format(data.metrics.todaySales)} note={`${data.metrics.todayTransactions} completed transaction${data.metrics.todayTransactions===1?"":"s"}`}/>
      <Metric icon={Boxes} label="Units in stock" value={String(data.metrics.units)} note={`${data.products.length} product groups`}/>
      <Metric icon={CircleAlert} label="Low stock" value={String(data.metrics.lowStock)} note={data.metrics.lowStock ? "Needs store attention" : "Stock levels healthy"} tone={data.metrics.lowStock?"warning":"good"}/>
      <Metric icon={Archive} label="Stock value" value={money.format(data.metrics.stockValue)} note="At recorded cost, or selling price when cost is unavailable"/>
    </section>
    <section className="store-dashboard-grid">
      <div className="store-card"><header><div><h3>Low-stock queue</h3><p>Variants at or below their reorder point.</p></div><button className="link-button" onClick={()=>onMode("products")}>All stock <ChevronRight size={14}/></button></header>{lowStock.length ? <div className="stock-queue">{lowStock.slice(0,6).map(({product,...variant})=><div key={variant.id}><span><b>{product.name}</b><small>{variantLabel(variant)} · {variant.sku}</small></span><strong>{variant.stockQuantity}<small>/ {variant.reorderLevel} min</small></strong>{data.access["store:stock"]?<button onClick={()=>onRestock(variant)}><RefreshCw size={13}/>Restock</button>:null}</div>)}</div>:<Empty title="Stock levels look healthy" detail="Nothing is currently at its reorder point."/>}</div>
      <div className="store-card"><header><div><h3>Recent sales</h3><p>Latest completed or voided transactions.</p></div><button className="link-button" onClick={()=>onMode("history")}>Full history <ChevronRight size={14}/></button></header>{recentSales.length?<div className="sales-mini">{recentSales.map(sale=><Link key={sale.id} href={`/school/store/receipt/${sale.id}`}><span><b>{sale.receiptNo}</b><small>{sale.customerName} · {sale.paymentMethod}</small></span><span className="sale-right"><strong>{money.format(sale.total)}</strong><small>{dateTime.format(new Date(sale.createdAt))}</small></span></Link>)}</div>:<Empty title="No store sales yet" detail="Completed sales will appear here with receipt links."/>}</div>
    </section>
    <section className="store-card"><header><div><h3>Top products · last 30 days</h3><p>Completed-sale volume only; voided sales are excluded.</p></div></header>{data.topProducts.length?<div className="store-top-products">{data.topProducts.map((row,index)=><div key={row.productName}><span className="rank">{index+1}</span><span><b>{row.productName}</b><small>{row.units} units sold</small></span><strong>{money.format(row.value)}</strong></div>)}</div>:<Empty title="Not enough sales history yet" detail="The ranking starts filling as store sales are recorded."/>}</section>
  </div>;
}

function StoreProducts({ data, canCreate, canStock, onCreate, onRestock, categories }: { data:StoreData; canCreate:boolean; canStock:boolean; onCreate:()=>void; onRestock:(variant:Variant)=>void; categories:string[] }) {
  const [query,setQuery]=useState(""); const [category,setCategory]=useState("all"); const [stock,setStock]=useState("all");
  const filtered = useMemo(()=>data.products.filter((product)=>{ const hay=`${product.name} ${product.sku} ${product.category||""} ${product.variants.map(v=>`${v.sku} ${v.size||""} ${v.color||""}`).join(" ")}`.toLowerCase(); if(query && !hay.includes(query.toLowerCase())) return false; if(category!=="all" && (product.category||"Uncategorised")!==category) return false; if(stock==="low" && !product.variants.some(v=>v.stockQuantity<=v.reorderLevel)) return false; if(stock==="out" && !product.variants.some(v=>v.stockQuantity===0)) return false; return true; }),[data.products,query,category,stock]);
  return <section className="store-section"><div className="store-section-head"><div><small>CATALOGUE & INVENTORY</small><h2>Products and stock</h2><p>Product groups keep multiple sizes or colours together while every variant keeps its own stock and price.</p></div>{canCreate?<button className="store-primary" onClick={onCreate}><Plus size={16}/>Add product</button>:null}</div><div className="store-filters"><label className="store-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search product, SKU, size…"/></label><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.sort().map(value=><option key={value} value={value}>{value}</option>)}</select><select value={stock} onChange={e=>setStock(e.target.value)}><option value="all">All stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></div>{filtered.length?<div className="product-grid">{filtered.map(product=><article key={product.id} className="product-card"><header><div><small>{product.category||"Uncategorised"}</small><h3>{product.name}</h3><span>{product.sku}</span></div><span className="variant-count">{product.variants.length} variant{product.variants.length===1?"":"s"}</span></header>{product.description?<p>{product.description}</p>:null}<div className="variant-list">{product.variants.map(variant=><div key={variant.id} className={variant.stockQuantity<=variant.reorderLevel?"is-low":""}><span><b>{variantLabel(variant)}</b><small>{variant.sku}{variant.barcode?` · ${variant.barcode}`:""}</small></span><span><strong>{money.format(variant.price)}</strong><small>{variant.stockQuantity} in stock · reorder {variant.reorderLevel}</small></span>{canStock?<button onClick={()=>onRestock(variant)} title="Restock"><PackagePlus size={15}/></button>:null}</div>)}</div></article>)}</div>:<Empty title="No products match these filters" detail="Clear the filters or add the first product group."/>}</section>;
}

function StoreSaleDesk({data,allVariants,mutate,onComplete}:{data:StoreData;allVariants:Array<Variant&{product:Product}>;mutate:(body:Record<string,unknown>)=>Promise<JsonResponse>;onComplete:(receipt:string)=>void}) {
  const [customerType,setCustomerType]=useState<"student"|"guardian"|"external">("student"); const [customerId,setCustomerId]=useState(""); const [name,setName]=useState(""); const [phone,setPhone]=useState(""); const [method,setMethod]=useState("Cash"); const [reference,setReference]=useState(""); const [discount,setDiscount]=useState("0"); const [cart,setCart]=useState<CartLine[]>([]); const [catalogQuery,setCatalogQuery]=useState(""); const [working,setWorking]=useState(false);
  const available=allVariants.filter(v=>v.status==="active"&&v.stockQuantity>0&&`${v.product.name} ${v.sku} ${v.size||""} ${v.color||""}`.toLowerCase().includes(catalogQuery.toLowerCase())); const subtotal=cart.reduce((sum,line)=>sum+(allVariants.find(v=>v.id===line.variantId)?.price||0)*line.quantity,0); const total=Math.max(0,subtotal-(Number(discount)||0));
  const add=(id:string)=>setCart(current=>{const found=current.find(line=>line.variantId===id);return found?current.map(line=>line.variantId===id?{...line,quantity:Math.min(line.quantity+1,allVariants.find(v=>v.id===id)?.stockQuantity||line.quantity)}:line):[...current,{variantId:id,quantity:1}]});
  const submit=async()=>{if(!data.access["store:sell"]||!cart.length)return;setWorking(true);try{const payload=await mutate({action:"sale",customerType,studentId:customerType==="student"?customerId:null,guardianId:customerType==="guardian"?customerId:null,customerName:customerType==="external"?name:null,customerPhone:customerType==="external"?phone:null,paymentMethod:method,paymentReference:reference||null,discount:Number(discount)||0,lines:cart});const receipt=payload.result?.receiptNo||"receipt";setCart([]);onComplete(receipt);if(payload.result?.saleId) window.location.href=`/school/store/receipt/${payload.result.saleId}`;}finally{setWorking(false)}};
  return <section className="store-section"><div className="store-section-head"><div><small>POINT OF SALE</small><h2>New sale</h2><p>Choose who is buying, add exact sizes or variants, then complete one auditable transaction.</p></div></div>{!data.access["store:sell"]?<div className="store-permission-note">Your account can view the store but cannot record sales. The school owner can delegate <b>Record store sales</b>.</div>:<div className="sale-layout"><div className="sale-catalog"><div className="sale-customer"><div className="segmented">{([['student','Student'],['guardian','Guardian'],['external','Other customer']] as const).map(([key,label])=><button key={key} className={customerType===key?"is-active":""} onClick={()=>{setCustomerType(key);setCustomerId("")}}>{label}</button>)}</div>{customerType==="student"?<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Select student</option>{data.students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.admissionNo}{s.class?` · ${s.class.name}`:""}</option>)}</select>:customerType==="guardian"?<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Select guardian</option>{data.guardians.map(g=><option key={g.id} value={g.id}>{g.name}{g.phone?` · ${g.phone}`:""}</option>)}</select>:<div className="external-grid"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Customer name"/><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone (optional)"/></div>}</div><label className="store-search big"><Search size={16}/><input value={catalogQuery} onChange={e=>setCatalogQuery(e.target.value)} placeholder="Search products, SKU, size or colour"/></label><div className="sale-products">{available.slice(0,60).map(v=><button key={v.id} onClick={()=>add(v.id)}><span><b>{v.product.name}</b><small>{variantLabel(v)} · {v.sku}</small></span><span><strong>{money.format(v.price)}</strong><small>{v.stockQuantity} available</small></span><Plus size={16}/></button>)}</div></div><aside className="cart-panel"><header><span><ShoppingCart size={17}/><b>Current sale</b></span><small>{cart.reduce((sum,line)=>sum+line.quantity,0)} items</small></header>{cart.length?<div className="cart-lines">{cart.map(line=>{const v=allVariants.find(item=>item.id===line.variantId)!;return <div key={line.variantId}><span><b>{v.product.name}</b><small>{variantLabel(v)} · {money.format(v.price)}</small></span><span className="qty-control"><button onClick={()=>setCart(c=>c.flatMap(x=>x.variantId===line.variantId?(x.quantity<=1?[]:[{...x,quantity:x.quantity-1}]):[x]))}>−</button><b>{line.quantity}</b><button onClick={()=>add(line.variantId)}>+</button></span><strong>{money.format(v.price*line.quantity)}</strong></div>})}</div>:<Empty title="Cart is empty" detail="Choose an available product variant to add it."/>}<div className="cart-payment"><label>Payment method<select value={method} onChange={e=>setMethod(e.target.value)}><option>Cash</option><option>Mobile Money</option><option>Card / POS</option><option>Bank transfer</option><option>Cheque</option></select></label><label>Payment reference<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Optional reference"/></label><label>Discount (GHS)<input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label></div><div className="cart-total"><span><small>Subtotal</small><b>{money.format(subtotal)}</b></span><span><small>Discount</small><b>− {money.format(Number(discount)||0)}</b></span><span className="grand"><strong>Total</strong><strong>{money.format(total)}</strong></span></div><button className="checkout" disabled={working||!cart.length||(customerType!=="external"&&!customerId)||(customerType==="external"&&!name.trim())} onClick={()=>void submit()}>{working?"Completing sale…":<><ReceiptText size={17}/>Complete sale & receipt</>}</button></aside></div>}</section>;
}

function StoreHistory({data,onVoid}:{data:StoreData;onVoid:(sale:Sale)=>void}) { const [q,setQ]=useState(""); const [method,setMethod]=useState("all"); const [status,setStatus]=useState("all"); const filtered=data.sales.filter(s=>{const hay=`${s.receiptNo} ${s.customerName} ${s.customerPhone||""} ${s.paymentReference||""}`.toLowerCase();return(!q||hay.includes(q.toLowerCase()))&&(method==="all"||s.paymentMethod===method)&&(status==="all"||s.status===status)}); const methods=[...new Set(data.sales.map(s=>s.paymentMethod))]; return <section className="store-section"><div className="store-section-head"><div><small>SALES LEDGER</small><h2>Sales history</h2><p>Searchable receipts with controlled voids and export tools.</p></div>{data.access["store:export"]?<div className="export-row"><a href="/api/school/store/export?format=excel"><FileSpreadsheet size={15}/>Excel</a><a href="/api/school/store/export?format=word"><FileText size={15}/>Word</a><Link href="/school/store/history/print"><Printer size={15}/>PDF / print</Link></div>:null}</div><div className="store-filters"><label className="store-search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Receipt, customer, reference…"/></label><select value={method} onChange={e=>setMethod(e.target.value)}><option value="all">All payment methods</option>{methods.map(v=><option key={v}>{v}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="completed">Completed</option><option value="void">Voided</option></select></div>{filtered.length?<div className="sales-table-wrap"><table className="store-table"><thead><tr><th>Receipt</th><th>Customer</th><th>Payment</th><th>Date</th><th className="num">Total</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(s=><tr key={s.id}><td><Link href={`/school/store/receipt/${s.id}`}><b>{s.receiptNo}</b></Link></td><td><b>{s.customerName}</b><small>{s.customerType}{s.customerPhone?` · ${s.customerPhone}`:""}</small></td><td>{s.paymentMethod}<small>{s.paymentReference||"No reference"}</small></td><td>{dateTime.format(new Date(s.createdAt))}</td><td className="num"><b>{money.format(s.total)}</b></td><td><span className={`status ${s.status}`}>{s.status}</span></td><td>{s.status==="completed"&&data.access["store:void_sale"]?<button className="danger-link" onClick={()=>onVoid(s)}>Void</button>:<Link className="open-link" href={`/school/store/receipt/${s.id}`}>Open</Link>}</td></tr>)}</tbody></table></div>:<Empty title="No sales match these filters" detail="Try another search or status."/>}</section> }

function ProductPanel({saving,onClose,mutate,onDone}:{saving:boolean;onClose:()=>void;mutate:(body:Record<string,unknown>)=>Promise<JsonResponse>;onDone:()=>void}) { const [name,setName]=useState("");const [sku,setSku]=useState("");const [category,setCategory]=useState("");const [description,setDescription]=useState("");const [variants,setVariants]=useState<VariantDraft[]>([initialVariant()]); const submit=async()=>{await mutate({action:"product.create",name,sku,category:category||null,description:description||null,variants:variants.map(({key:_key,...v})=>({sku:v.sku,size:v.size||null,color:v.color||null,barcode:v.barcode||null,price:Number(v.price),costPrice:v.costPrice?Number(v.costPrice):null,openingStock:Number(v.openingStock)||0,reorderLevel:Number(v.reorderLevel)||0}))});onDone()}; return <SidePanel title="Add product" kicker="CATALOGUE" note="Create one product group, then define its available sizes or other variants." onClose={onClose}><div className="panel-form"><label>Product name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. School Polo Shirt"/></label><div className="form-grid"><label>Product SKU<input value={sku} onChange={e=>setSku(e.target.value)} placeholder="POLO"/></label><label>Category<input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Uniform"/></label></div><label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3}/></label><div className="variant-builder"><header><div><b>Variants / sizes</b><small>Each variant keeps its own SKU, price and stock.</small></div><button onClick={()=>setVariants(v=>[...v,initialVariant()])}><Plus size={14}/>Add size</button></header>{variants.map((v,index)=><div className="variant-draft" key={v.key}><div className="variant-draft-head"><b>Variant {index+1}</b>{variants.length>1?<button onClick={()=>setVariants(rows=>rows.filter(row=>row.key!==v.key))}><X size={14}/></button>:null}</div><div className="form-grid three"><label>SKU<input value={v.sku} onChange={e=>setVariants(rows=>rows.map(row=>row.key===v.key?{...row,sku:e.target.value}:row))}/></label><label>Size / option<input value={v.size} onChange={e=>setVariants(rows=>rows.map(row=>row.key===v.key?{...row,size:e.target.value}:row))} placeholder="S, M, 42…"/></label><label>Colour<input value={v.color} onChange={e=>setVariants(rows=>rows.map(row=>row.key===v.key?{...row,color:e.target.value}:row))}/></label><label>Selling price<input type="number" min="0" step="0.01" value={v.price} onChange={e=>setVariants(rows=>rows.map(row=>row.key===v.key?{...row,price:e.target.value}:row))}/></label><label>Cost price<input type="number" min="0" step="0.01" value={v.costPrice} onChange={e=>setVariants(rows=>rows.map(row=>row.key===v.key?{...row,costPrice:e.target.value}:row))}/></label><label>Opening stock<input type="number" min="0" value={v.openingStock} onChange={e=>setVariants(rows=>rows.map(row=>row.key===v.key?{...row,openingStock:e.target.value}:row))}/></label><label>Reorder at<input type="number" min="0" value={v.reorderLevel} onChange={e=>setVariants(rows=>rows.map(row=>row.key===v.key?{...row,reorderLevel:e.target.value}:row))}/></label><label>Barcode<input value={v.barcode} onChange={e=>setVariants(rows=>rows.map(row=>row.key===v.key?{...row,barcode:e.target.value}:row))}/></label></div></div>)}</div><button className="panel-submit" disabled={saving||!name.trim()||!sku.trim()||variants.some(v=>!v.sku.trim()||v.price==="")} onClick={()=>void submit()}>{saving?"Saving…":"Create product & stock"}</button></div></SidePanel> }

function RestockPanel({variant,saving,onClose,mutate,onDone}:{variant:Variant;saving:boolean;onClose:()=>void;mutate:(body:Record<string,unknown>)=>Promise<JsonResponse>;onDone:()=>void}) { const [quantity,setQuantity]=useState("");const [unitCost,setUnitCost]=useState(variant.costPrice===null?"":String(variant.costPrice));const [notes,setNotes]=useState("");const submit=async()=>{await mutate({action:"stock.restock",variantId:variant.id,quantity:Number(quantity),unitCost:unitCost?Number(unitCost):null,notes:notes||null});onDone()};return <SidePanel title="Restock variant" kicker="STOCK IN" note={`${variant.sku} · ${variantLabel(variant)} · ${variant.stockQuantity} currently in stock`} onClose={onClose}><div className="panel-form"><label>Quantity received<input autoFocus type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>Unit cost (GHS)<input type="number" min="0" step="0.01" value={unitCost} onChange={e=>setUnitCost(e.target.value)}/></label><label>Notes / supplier reference<textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)}/></label><button className="panel-submit" disabled={saving||Number(quantity)<=0} onClick={()=>void submit()}>{saving?"Updating stock…":"Confirm restock"}</button></div></SidePanel>}
function VoidPanel({sale,saving,onClose,mutate,onDone}:{sale:Sale;saving:boolean;onClose:()=>void;mutate:(body:Record<string,unknown>)=>Promise<JsonResponse>;onDone:()=>void}) { const [reason,setReason]=useState(""); const submit=async()=>{await mutate({action:"sale.void",saleId:sale.id,reason});onDone()};return <SidePanel title="Void sale" kicker="CONTROLLED REVERSAL" note={`${sale.receiptNo} · ${sale.customerName} · ${money.format(sale.total)}`} onClose={onClose}><div className="void-warning"><CircleAlert size={18}/><p>This does not delete the transaction. SukuuNova marks it void, records who performed the reversal and restores sold stock.</p></div><div className="panel-form"><label>Reason<textarea autoFocus rows={5} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why this sale is being voided…"/></label><button className="panel-submit danger" disabled={saving||reason.trim().length<3} onClick={()=>void submit()}>{saving?"Voiding sale…":"Void & restore stock"}</button></div></SidePanel> }
function Metric({icon:Icon,label,value,note,tone}:{icon:typeof Store;label:string;value:string;note:string;tone?:"warning"|"good"}) { return <article className={`store-kpi ${tone||""}`}><span className="store-kpi-icon"><Icon size={18}/></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article> }
function Empty({title,detail}:{title:string;detail:string}) { return <div className="store-empty"><Boxes size={22}/><b>{title}</b><span>{detail}</span></div> }
function SidePanel({title,kicker,note,onClose,children}:{title:string;kicker:string;note:string;onClose:()=>void;children:React.ReactNode}) { return <div className="store-panel-backdrop" role="presentation" onMouseDown={onClose}><aside className="store-side-panel" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><header><div><small>{kicker}</small><h2>{title}</h2><p>{note}</p></div><button onClick={onClose} aria-label="Close"><X size={18}/></button></header>{children}</aside></div> }
