#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");

const SCHOOL_CODE = "eug123";
const SCHOOL_NAME = "Eugene Academy";
const targetMode = String(process.env.EUGENE_ACADEMY_OPERATIONS_TARGET || "trial").trim().toLowerCase();
const trialUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();

if (!new Set(["trial","production"]).has(targetMode)) throw new Error("EUGENE_ACADEMY_OPERATIONS_TARGET must be trial or production.");
if (targetMode === "trial") {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim() !== "YES") throw new Error("Refusing Eugene Academy operations showcase: trial acknowledgement is missing.");
  if (!trialUrl) throw new Error("TEST_DATABASE_URL is required for the Eugene Academy operations showcase.");
  if (productionUrl && productionUrl === trialUrl) throw new Error("Refusing Eugene Academy operations showcase: TEST_DATABASE_URL must differ from DATABASE_URL.");
} else {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED || "").trim() !== "EUGENE_ACADEMY_ONLY") throw new Error("Refusing Eugene Academy production operations showcase: exact acknowledgement is missing.");
  if (!productionUrl) throw new Error("DATABASE_URL is required for the Eugene Academy production operations showcase.");
  const railwayEnvironment = String(process.env.RAILWAY_ENVIRONMENT_NAME || "").trim().toLowerCase();
  if (railwayEnvironment && railwayEnvironment !== "production") throw new Error("Refusing Eugene Academy production operations showcase outside Railway production.");
}

const databaseUrl = targetMode === "production" ? productionUrl : trialUrl;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, transactionOptions: { maxWait: 15000, timeout: 180000 } });

const products = [
  { id: "eug-store-product-polo", sku: "EA-POLO", name: "Eugene Academy Polo Shirt", category: "Uniform", description: "Official school polo shirt.", variants: [
    ["eug-store-var-polo-s","EA-POLO-S","S",null,85,54,18,5],
    ["eug-store-var-polo-m","EA-POLO-M","M",null,85,54,24,6],
    ["eug-store-var-polo-l","EA-POLO-L","L",null,85,54,16,5],
    ["eug-store-var-polo-xl","EA-POLO-XL","XL",null,90,58,8,4],
  ]},
  { id: "eug-store-product-pe", sku: "EA-PE-SHORT", name: "PE Shorts", category: "Uniform", description: "School physical education shorts.", variants: [
    ["eug-store-var-pe-s","EA-PE-S","S",null,55,32,14,4],
    ["eug-store-var-pe-m","EA-PE-M","M",null,55,32,18,4],
    ["eug-store-var-pe-l","EA-PE-L","L",null,55,32,11,4],
  ]},
  { id: "eug-store-product-tie", sku: "EA-TIE", name: "School Tie", category: "Uniform", description: "Official Eugene Academy neck tie.", variants: [
    ["eug-store-var-tie","EA-TIE-STD",null,null,38,20,28,8],
  ]},
  { id: "eug-store-product-exbook", sku: "EA-EXBOOK", name: "Exercise Book", category: "Stationery", description: "Branded school exercise book.", variants: [
    ["eug-store-var-exbook-80","EA-EX-80","80 pages",null,12,7,60,15],
    ["eug-store-var-exbook-120","EA-EX-120","120 pages",null,18,11,45,12],
  ]},
];

const locations = [
  ["eug-prop-loc-science","Science Laboratory","SCI-LAB","Laboratory","Academic Block A","Ground floor","Science practical room and equipment store."],
  ["eug-prop-loc-ict","ICT Laboratory","ICT-LAB","ICT Lab","Academic Block B","First floor","Computer laboratory and digital learning equipment."],
  ["eug-prop-loc-class1b","Class 1B","CLS-1B","Classroom","Primary Block","Ground floor","Class 1B teaching room."],
  ["eug-prop-loc-admin","Administration Office","ADMIN","Office","Administration Block","Ground floor","School leadership and administration office."],
];

const propertyItems = [
  { id:"eug-prop-item-chair", code:"CHAIR-STUDENT", name:"Student Chair", category:"Furniture", unit:"chair", track:false, holding:["eug-prop-hold-chair-1b","eug-prop-loc-class1b",25,"good","active",null,null,140] },
  { id:"eug-prop-item-microscope", code:"MICROSCOPE", name:"Compound Microscope", category:"Science Equipment", unit:"unit", track:false, holding:["eug-prop-hold-micro-science","eug-prop-loc-science",8,"good","active",null,null,1650] },
  { id:"eug-prop-item-laptop", code:"ICT-LAPTOP", name:"Student Laptop", category:"ICT Equipment", unit:"unit", track:false, holding:["eug-prop-hold-laptop-ict","eug-prop-loc-ict",20,"good","active",null,null,4200] },
  { id:"eug-prop-item-projector", code:"PROJECTOR", name:"Multimedia Projector", category:"ICT Equipment", unit:"unit", track:true, holding:["eug-prop-hold-projector","eug-prop-loc-ict",1,"maintenance","maintenance","EA-PROJ-0042",null,6800] },
  { id:"eug-prop-item-desk", code:"OFFICE-DESK", name:"Administration Desk", category:"Furniture", unit:"desk", track:false, holding:["eug-prop-hold-desk-admin","eug-prop-loc-admin",6,"good","active",null,null,950] },
];

async function main() {
  const directory = await prisma.schoolLoginDirectory.findUnique({ where: { uniqueCode: SCHOOL_CODE } });
  if (!directory) throw new Error(`Eugene Academy directory '${SCHOOL_CODE}' was not found.`);
  const schoolId = directory.schoolId;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, uniqueCode: true } });
    if (!school || school.name !== SCHOOL_NAME || school.uniqueCode !== SCHOOL_CODE) throw new Error(`Refusing operations showcase: expected ${SCHOOL_NAME} (${SCHOOL_CODE}).`);

    const [actor, student, guardian] = await Promise.all([
      tx.user.findFirst({ where: { schoolId, status: "active", userRoles: { some: { role: { OR: [{ key: "owner" }, { name: "Owner" }, { key: "principal" }, { name: "Principal" }] } } } }, orderBy: { id: "asc" }, select: { id: true, name: true } }),
      tx.student.findFirst({ where: { schoolId, status: "active" }, orderBy: { admissionNo: "asc" }, select: { id: true, name: true, admissionNo: true } }),
      tx.guardian.findFirst({ where: { schoolId }, orderBy: { id: "asc" }, select: { id: true, name: true, phone: true } }),
    ]);
    if (!actor || !student || !guardian) throw new Error("Eugene Academy needs an active leadership account, student and guardian before operations showcase data can be created.");

    await tx.$executeRawUnsafe(`DELETE FROM "SchoolStoreStockMovement" WHERE "schoolId"=$1 AND ("id" LIKE 'eug-store-%' OR "referenceId" LIKE 'eug-store-%')`, schoolId);
    await tx.$executeRawUnsafe(`DELETE FROM "SchoolStoreSaleLine" WHERE "schoolId"=$1 AND ("id" LIKE 'eug-store-%' OR "saleId" LIKE 'eug-store-%')`, schoolId);
    await tx.$executeRawUnsafe(`DELETE FROM "SchoolStoreSale" WHERE "schoolId"=$1 AND "id" LIKE 'eug-store-%'`, schoolId);
    await tx.$executeRawUnsafe(`DELETE FROM "SchoolStoreVariant" WHERE "schoolId"=$1 AND "id" LIKE 'eug-store-%'`, schoolId);
    await tx.$executeRawUnsafe(`DELETE FROM "SchoolStoreProduct" WHERE "schoolId"=$1 AND "id" LIKE 'eug-store-%'`, schoolId);

    for (const product of products) {
      await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreProduct" ("id","schoolId","name","sku","category","description") VALUES ($1,$2,$3,$4,$5,$6)`, product.id, schoolId, product.name, product.sku, product.category, product.description);
      for (const variant of product.variants) {
        const [id,sku,size,color,price,cost,stock,reorder] = variant;
        await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreVariant" ("id","schoolId","productId","sku","size","color","price","costPrice","stockQuantity","reorderLevel") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, id, schoolId, product.id, sku, size, color, price, cost, stock, reorder);
        await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreStockMovement" ("id","schoolId","variantId","movementType","quantityDelta","referenceType","referenceId","unitCost","notes","createdBy") VALUES ($1,$2,$3,'opening',$4,'showcase',$5,$6,'Eugene Academy showcase opening stock',$7)`, `eug-store-move-${id}`, schoolId, id, stock, product.id, cost, actor.id);
      }
    }

    const saleId = "eug-store-sale-001";
    const saleLines = [
      ["eug-store-var-polo-m",1,85],
      ["eug-store-var-exbook-120",2,18],
    ];
    const subtotal = saleLines.reduce((sum,line)=>sum + line[1]*line[2],0);
    await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreSale" ("id","schoolId","receiptNo","customerType","studentId","customerName","paymentMethod","paymentReference","subtotal","discount","total","createdBy","createdAt") VALUES ($1,$2,'ST-EUG-0001','student',$3,$4,'Mobile Money','EUG-DEMO-MOMO-01',$5,0,$5,$6,CURRENT_TIMESTAMP-INTERVAL '1 day')`, saleId, schoolId, student.id, `${student.name} · ${student.admissionNo}`, subtotal, actor.id);
    for (let index=0; index<saleLines.length; index++) {
      const [variantId,quantity,unitPrice] = saleLines[index];
      const product = products.find((p)=>p.variants.some((v)=>v[0]===variantId));
      const variant = product.variants.find((v)=>v[0]===variantId);
      const label = [variant[2],variant[3]].filter(Boolean).join(" / ") || null;
      await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreSaleLine" ("id","schoolId","saleId","productId","variantId","productName","variantLabel","sku","quantity","unitPrice","lineTotal") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, `eug-store-line-${index+1}`, schoolId, saleId, product.id, variantId, product.name, label, variant[1], quantity, unitPrice, quantity*unitPrice);
      await tx.$executeRawUnsafe(`UPDATE "SchoolStoreVariant" SET "stockQuantity"="stockQuantity"-$3 WHERE "schoolId"=$1 AND "id"=$2`, schoolId, variantId, quantity);
      await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreStockMovement" ("id","schoolId","variantId","movementType","quantityDelta","referenceType","referenceId","notes","createdBy","createdAt") VALUES ($1,$2,$3,'sale',$4,'sale',$5,'Showcase student sale',$6,CURRENT_TIMESTAMP-INTERVAL '1 day')`, `eug-store-sale-move-${index+1}`, schoolId, variantId, -quantity, saleId, actor.id);
    }

    await tx.$executeRawUnsafe(`DELETE FROM "SchoolPropertyMovement" WHERE "schoolId"=$1 AND "id" LIKE 'eug-prop-%'`, schoolId);
    await tx.$executeRawUnsafe(`DELETE FROM "SchoolPropertyHolding" WHERE "schoolId"=$1 AND "id" LIKE 'eug-prop-%'`, schoolId);
    await tx.$executeRawUnsafe(`DELETE FROM "SchoolPropertyItem" WHERE "schoolId"=$1 AND "id" LIKE 'eug-prop-%'`, schoolId);
    await tx.$executeRawUnsafe(`DELETE FROM "SchoolPropertyLocation" WHERE "schoolId"=$1 AND "id" LIKE 'eug-prop-%'`, schoolId);

    for (const [id,name,code,type,building,floor,description] of locations) {
      await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyLocation" ("id","schoolId","name","code","locationType","building","floor","description") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, id, schoolId, name, code, type, building, floor, description);
    }
    for (const item of propertyItems) {
      await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyItem" ("id","schoolId","itemCode","name","category","unit","trackSerial") VALUES ($1,$2,$3,$4,$5,$6,$7)`, item.id, schoolId, item.code, item.name, item.category, item.unit, item.track);
      const [holdingId,locationId,quantity,condition,status,serial,custodian,unitValue] = item.holding;
      await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyHolding" ("id","schoolId","itemId","locationId","quantity","condition","status","serialNumber","unitValue","custodianUserId","notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Eugene Academy showcase property')`, holdingId, schoolId, item.id, locationId, quantity, condition, status, serial, unitValue, custodian);
      await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyMovement" ("id","schoolId","itemId","toLocationId","quantity","action","toCondition","toStatus","reason","reference","createdBy","createdAt") VALUES ($1,$2,$3,$4,$5,'receive',$6,$7,'Opening showcase register',$8,$9,CURRENT_TIMESTAMP-INTERVAL '7 days')`, `eug-prop-move-${item.id}`, schoolId, item.id, locationId, quantity, condition, status, item.code, actor.id);
    }
    await tx.$executeRawUnsafe(`INSERT INTO "SchoolPropertyMovement" ("id","schoolId","itemId","fromLocationId","toLocationId","quantity","action","fromCondition","toCondition","fromStatus","toStatus","reason","reference","createdBy","createdAt") VALUES ('eug-prop-move-projector-maint',$1,'eug-prop-item-projector','eug-prop-loc-ict','eug-prop-loc-ict',1,'maintenance','good','maintenance','active','maintenance','Projector lamp requires replacement','MAINT-0042',$2,CURRENT_TIMESTAMP-INTERVAL '2 days')`, schoolId, actor.id);

    return { school: school.name, products: products.length, storeVariants: products.reduce((sum,p)=>sum+p.variants.length,0), storeSales: 1, propertyLocations: locations.length, propertyItems: propertyItems.length, actor: actor.name, sampleStudent: student.name, sampleGuardian: guardian.name };
  });

  console.log("[eugene-operations-showcase] verified", JSON.stringify(result));
}

main().catch((error) => {
  console.error("[eugene-operations-showcase] failed:", error instanceof Error ? (error.stack || error.message) : String(error));
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
