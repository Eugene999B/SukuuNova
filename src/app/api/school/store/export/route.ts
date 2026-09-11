import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { officeDownloadResponse } from "@/lib/office-export";
import { schoolStoreExportRows } from "@/lib/school-store-service";

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "doc" ? "doc" : "xls";
    const rows = await withTenant(session.schoolId, (tx) => schoolStoreExportRows(tx, session.schoolId, session.userId));
    return officeDownloadResponse({
      format,
      filename: `school-store-sales-${new Date().toISOString().slice(0,10)}`,
      title: "School Store Sales History",
      subtitle: `Generated ${new Date().toLocaleString("en-GH")}`,
      headers: ["Receipt","Date","Customer type","Customer","Phone","Payment method","Payment reference","Items","Subtotal","Discount","Total","Status","Cashier"],
      rows: rows.map((row) => [row.receiptNo, row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt, row.customerType, row.customerName, row.customerPhone, row.paymentMethod, row.paymentReference, row.items, Number(row.subtotal), Number(row.discount), Number(row.total), row.status, row.cashier]),
    });
  } catch (error) {
    return routeError(error);
  }
}
