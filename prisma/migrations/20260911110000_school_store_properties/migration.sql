-- School Store + School Properties operational core.
-- These tables are deliberately separate: saleable stock is not school-owned property.

CREATE TABLE "SchoolStoreProduct" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolStoreProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolStoreProduct_status_check" CHECK ("status" IN ('active','archived'))
);
CREATE UNIQUE INDEX "SchoolStoreProduct_id_schoolId_key" ON "SchoolStoreProduct"("id","schoolId");
CREATE UNIQUE INDEX "SchoolStoreProduct_schoolId_sku_key" ON "SchoolStoreProduct"("schoolId","sku");
CREATE INDEX "SchoolStoreProduct_school_category_idx" ON "SchoolStoreProduct"("schoolId","category","status");

CREATE TABLE "SchoolStoreVariant" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "size" TEXT,
  "color" TEXT,
  "barcode" TEXT,
  "price" DECIMAL(14,2) NOT NULL,
  "costPrice" DECIMAL(14,2),
  "stockQuantity" INTEGER NOT NULL DEFAULT 0,
  "reorderLevel" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolStoreVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolStoreVariant_price_check" CHECK ("price" >= 0),
  CONSTRAINT "SchoolStoreVariant_cost_check" CHECK ("costPrice" IS NULL OR "costPrice" >= 0),
  CONSTRAINT "SchoolStoreVariant_stock_check" CHECK ("stockQuantity" >= 0),
  CONSTRAINT "SchoolStoreVariant_reorder_check" CHECK ("reorderLevel" >= 0),
  CONSTRAINT "SchoolStoreVariant_status_check" CHECK ("status" IN ('active','archived'))
);
CREATE UNIQUE INDEX "SchoolStoreVariant_id_schoolId_key" ON "SchoolStoreVariant"("id","schoolId");
CREATE UNIQUE INDEX "SchoolStoreVariant_schoolId_sku_key" ON "SchoolStoreVariant"("schoolId","sku");
CREATE UNIQUE INDEX "SchoolStoreVariant_schoolId_barcode_key" ON "SchoolStoreVariant"("schoolId","barcode") WHERE "barcode" IS NOT NULL;
CREATE INDEX "SchoolStoreVariant_school_product_idx" ON "SchoolStoreVariant"("schoolId","productId","status");
CREATE INDEX "SchoolStoreVariant_school_stock_idx" ON "SchoolStoreVariant"("schoolId","stockQuantity","reorderLevel");

CREATE TABLE "SchoolStoreSale" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "receiptNo" TEXT NOT NULL,
  "customerType" TEXT NOT NULL,
  "studentId" TEXT,
  "guardianId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT,
  "paymentMethod" TEXT NOT NULL,
  "paymentReference" TEXT,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidedBy" TEXT,
  "voidReason" TEXT,
  CONSTRAINT "SchoolStoreSale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolStoreSale_customer_type_check" CHECK ("customerType" IN ('student','guardian','external')),
  CONSTRAINT "SchoolStoreSale_status_check" CHECK ("status" IN ('completed','void')),
  CONSTRAINT "SchoolStoreSale_money_check" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "total" >= 0 AND "discount" <= "subtotal")
);
CREATE UNIQUE INDEX "SchoolStoreSale_id_schoolId_key" ON "SchoolStoreSale"("id","schoolId");
CREATE UNIQUE INDEX "SchoolStoreSale_school_receipt_key" ON "SchoolStoreSale"("schoolId","receiptNo");
CREATE INDEX "SchoolStoreSale_school_created_idx" ON "SchoolStoreSale"("schoolId","createdAt" DESC);
CREATE INDEX "SchoolStoreSale_school_student_idx" ON "SchoolStoreSale"("schoolId","studentId","createdAt" DESC);
CREATE INDEX "SchoolStoreSale_school_guardian_idx" ON "SchoolStoreSale"("schoolId","guardianId","createdAt" DESC);

CREATE TABLE "SchoolStoreSaleLine" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "variantLabel" TEXT,
  "sku" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "SchoolStoreSaleLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolStoreSaleLine_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "SchoolStoreSaleLine_money_check" CHECK ("unitPrice" >= 0 AND "lineTotal" >= 0)
);
CREATE UNIQUE INDEX "SchoolStoreSaleLine_id_schoolId_key" ON "SchoolStoreSaleLine"("id","schoolId");
CREATE INDEX "SchoolStoreSaleLine_school_sale_idx" ON "SchoolStoreSaleLine"("schoolId","saleId");
CREATE INDEX "SchoolStoreSaleLine_school_variant_idx" ON "SchoolStoreSaleLine"("schoolId","variantId");

CREATE TABLE "SchoolStoreStockMovement" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "movementType" TEXT NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "unitCost" DECIMAL(14,2),
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolStoreStockMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolStoreStockMovement_delta_check" CHECK ("quantityDelta" <> 0),
  CONSTRAINT "SchoolStoreStockMovement_type_check" CHECK ("movementType" IN ('opening','restock','sale','void','adjustment','return'))
);
CREATE UNIQUE INDEX "SchoolStoreStockMovement_id_schoolId_key" ON "SchoolStoreStockMovement"("id","schoolId");
CREATE INDEX "SchoolStoreStockMovement_school_variant_created_idx" ON "SchoolStoreStockMovement"("schoolId","variantId","createdAt" DESC);

CREATE TABLE "SchoolPropertyLocation" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "locationType" TEXT NOT NULL,
  "building" TEXT,
  "floor" TEXT,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPropertyLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolPropertyLocation_status_check" CHECK ("status" IN ('active','inactive'))
);
CREATE UNIQUE INDEX "SchoolPropertyLocation_id_schoolId_key" ON "SchoolPropertyLocation"("id","schoolId");
CREATE UNIQUE INDEX "SchoolPropertyLocation_school_code_key" ON "SchoolPropertyLocation"("schoolId","code");
CREATE INDEX "SchoolPropertyLocation_school_type_idx" ON "SchoolPropertyLocation"("schoolId","locationType","status");

CREATE TABLE "SchoolPropertyItem" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "itemCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'unit',
  "description" TEXT,
  "trackSerial" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPropertyItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolPropertyItem_status_check" CHECK ("status" IN ('active','archived'))
);
CREATE UNIQUE INDEX "SchoolPropertyItem_id_schoolId_key" ON "SchoolPropertyItem"("id","schoolId");
CREATE UNIQUE INDEX "SchoolPropertyItem_school_code_key" ON "SchoolPropertyItem"("schoolId","itemCode");
CREATE INDEX "SchoolPropertyItem_school_category_idx" ON "SchoolPropertyItem"("schoolId","category","status");

CREATE TABLE "SchoolPropertyHolding" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "condition" TEXT NOT NULL DEFAULT 'good',
  "status" TEXT NOT NULL DEFAULT 'active',
  "serialNumber" TEXT,
  "acquiredAt" TIMESTAMP(3),
  "unitValue" DECIMAL(14,2),
  "custodianUserId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPropertyHolding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolPropertyHolding_quantity_check" CHECK ("quantity" >= 0),
  CONSTRAINT "SchoolPropertyHolding_condition_check" CHECK ("condition" IN ('good','fair','damaged','maintenance')),
  CONSTRAINT "SchoolPropertyHolding_status_check" CHECK ("status" IN ('active','maintenance','lost','destroyed','disposed')),
  CONSTRAINT "SchoolPropertyHolding_value_check" CHECK ("unitValue" IS NULL OR "unitValue" >= 0)
);
CREATE UNIQUE INDEX "SchoolPropertyHolding_id_schoolId_key" ON "SchoolPropertyHolding"("id","schoolId");
CREATE UNIQUE INDEX "SchoolPropertyHolding_school_serial_key" ON "SchoolPropertyHolding"("schoolId","serialNumber") WHERE "serialNumber" IS NOT NULL;
CREATE INDEX "SchoolPropertyHolding_school_location_idx" ON "SchoolPropertyHolding"("schoolId","locationId","status");
CREATE INDEX "SchoolPropertyHolding_school_item_idx" ON "SchoolPropertyHolding"("schoolId","itemId","status");
CREATE INDEX "SchoolPropertyHolding_school_condition_idx" ON "SchoolPropertyHolding"("schoolId","condition","status");

CREATE TABLE "SchoolPropertyMovement" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "fromLocationId" TEXT,
  "toLocationId" TEXT,
  "quantity" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "fromCondition" TEXT,
  "toCondition" TEXT,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPropertyMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolPropertyMovement_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "SchoolPropertyMovement_action_check" CHECK ("action" IN ('receive','transfer','condition','maintenance','restore','lost','destroyed','dispose','adjustment'))
);
CREATE UNIQUE INDEX "SchoolPropertyMovement_id_schoolId_key" ON "SchoolPropertyMovement"("id","schoolId");
CREATE INDEX "SchoolPropertyMovement_school_created_idx" ON "SchoolPropertyMovement"("schoolId","createdAt" DESC);
CREATE INDEX "SchoolPropertyMovement_school_item_idx" ON "SchoolPropertyMovement"("schoolId","itemId","createdAt" DESC);

ALTER TABLE "SchoolStoreProduct" ADD CONSTRAINT "SchoolStoreProduct_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreVariant" ADD CONSTRAINT "SchoolStoreVariant_product_fkey" FOREIGN KEY ("productId","schoolId") REFERENCES "SchoolStoreProduct"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreSale" ADD CONSTRAINT "SchoolStoreSale_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreSale" ADD CONSTRAINT "SchoolStoreSale_guardian_fkey" FOREIGN KEY ("guardianId","schoolId") REFERENCES "Guardian"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreSale" ADD CONSTRAINT "SchoolStoreSale_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreSale" ADD CONSTRAINT "SchoolStoreSale_voidedBy_fkey" FOREIGN KEY ("voidedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreSaleLine" ADD CONSTRAINT "SchoolStoreSaleLine_sale_fkey" FOREIGN KEY ("saleId","schoolId") REFERENCES "SchoolStoreSale"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreSaleLine" ADD CONSTRAINT "SchoolStoreSaleLine_product_fkey" FOREIGN KEY ("productId","schoolId") REFERENCES "SchoolStoreProduct"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreSaleLine" ADD CONSTRAINT "SchoolStoreSaleLine_variant_fkey" FOREIGN KEY ("variantId","schoolId") REFERENCES "SchoolStoreVariant"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreStockMovement" ADD CONSTRAINT "SchoolStoreStockMovement_variant_fkey" FOREIGN KEY ("variantId","schoolId") REFERENCES "SchoolStoreVariant"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStoreStockMovement" ADD CONSTRAINT "SchoolStoreStockMovement_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SchoolPropertyLocation" ADD CONSTRAINT "SchoolPropertyLocation_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPropertyItem" ADD CONSTRAINT "SchoolPropertyItem_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPropertyHolding" ADD CONSTRAINT "SchoolPropertyHolding_item_fkey" FOREIGN KEY ("itemId","schoolId") REFERENCES "SchoolPropertyItem"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPropertyHolding" ADD CONSTRAINT "SchoolPropertyHolding_location_fkey" FOREIGN KEY ("locationId","schoolId") REFERENCES "SchoolPropertyLocation"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPropertyHolding" ADD CONSTRAINT "SchoolPropertyHolding_custodian_fkey" FOREIGN KEY ("custodianUserId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPropertyMovement" ADD CONSTRAINT "SchoolPropertyMovement_item_fkey" FOREIGN KEY ("itemId","schoolId") REFERENCES "SchoolPropertyItem"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPropertyMovement" ADD CONSTRAINT "SchoolPropertyMovement_from_location_fkey" FOREIGN KEY ("fromLocationId","schoolId") REFERENCES "SchoolPropertyLocation"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPropertyMovement" ADD CONSTRAINT "SchoolPropertyMovement_to_location_fkey" FOREIGN KEY ("toLocationId","schoolId") REFERENCES "SchoolPropertyLocation"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPropertyMovement" ADD CONSTRAINT "SchoolPropertyMovement_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'SchoolStoreProduct','SchoolStoreVariant','SchoolStoreSale','SchoolStoreSaleLine','SchoolStoreStockMovement',
    'SchoolPropertyLocation','SchoolPropertyItem','SchoolPropertyHolding','SchoolPropertyMovement'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), '''')) WITH CHECK ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), ''''))', t || '_tenant', t);
  END LOOP;
END $$;

INSERT INTO "Permission" ("id","key","description") VALUES
  ('store-view-20260911','store:view','View school store products, stock and sales'),
  ('store-catalog-20260911','store:manage_catalog','Create and maintain store products and variants'),
  ('store-stock-20260911','store:stock','Restock and adjust school store stock'),
  ('store-sell-20260911','store:sell','Record school store sales'),
  ('store-void-20260911','store:void_sale','Void completed school store sales and restore stock'),
  ('store-export-20260911','store:export','Export school store sales and stock records'),
  ('properties-view-20260911','properties:view','View school property locations, holdings and movement history'),
  ('properties-manage-20260911','properties:manage','Create property locations, items and holdings'),
  ('properties-move-20260911','properties:move','Transfer property and record condition or maintenance changes'),
  ('properties-dispose-20260911','properties:dispose','Record lost, destroyed or disposed school property'),
  ('properties-export-20260911','properties:export','Export school property registers and movement history')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- Existing schools keep their governed role policy. The Owner alone is guaranteed
-- access to every new operational capability so ownership can delegate intentionally.
INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE (r."key"='owner' OR r."name"='Owner')
  AND p."key" IN (
    'store:view','store:manage_catalog','store:stock','store:sell','store:void_sale','store:export',
    'properties:view','properties:manage','properties:move','properties:dispose','properties:export'
  )
ON CONFLICT DO NOTHING;
