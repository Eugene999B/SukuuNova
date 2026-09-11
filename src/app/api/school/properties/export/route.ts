import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { officeDownloadResponse } from "@/lib/office-export";
import { schoolPropertyExportRows, schoolPropertyMovementExportRows } from "@/lib/school-properties-service";

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "doc" ? "doc" : "xls";
    const type = url.searchParams.get("type") === "movements" ? "movements" : "register";
    if (type === "movements") {
      const rows = await withTenant(session.schoolId, (tx) => schoolPropertyMovementExportRows(tx, session.schoolId, session.userId));
      return officeDownloadResponse({
        format,
        filename: `school-property-movements-${new Date().toISOString().slice(0,10)}`,
        title: "School Property Movement History",
        subtitle: `Generated ${new Date().toLocaleString("en-GH")}`,
        headers: ["Date","Item code","Item","Quantity","Action","From location","To location","From condition","To condition","From status","To status","Reason","Reference","Recorded by"],
        rows: rows.map((row) => [row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt, row.itemCode, row.itemName, row.quantity, row.action, row.fromLocation, row.toLocation, row.fromCondition, row.toCondition, row.fromStatus, row.toStatus, row.reason, row.reference, row.recordedBy]),
      });
    }
    const rows = await withTenant(session.schoolId, (tx) => schoolPropertyExportRows(tx, session.schoolId, session.userId));
    return officeDownloadResponse({
      format,
      filename: `school-property-register-${new Date().toISOString().slice(0,10)}`,
      title: "School Property Register",
      subtitle: `Generated ${new Date().toLocaleString("en-GH")}`,
      headers: ["Item code","Item","Category","Unit","Quantity","Condition","Status","Serial number","Acquired","Unit value","Location","Location code","Location type","Custodian","Notes"],
      rows: rows.map((row) => [row.itemCode, row.itemName, row.category, row.unit, row.quantity, row.condition, row.status, row.serialNumber, row.acquiredAt instanceof Date ? row.acquiredAt.toISOString().slice(0,10) : row.acquiredAt, row.unitValue === null ? "" : Number(row.unitValue), row.locationName, row.locationCode, row.locationType, row.custodian, row.notes]),
    });
  } catch (error) {
    return routeError(error);
  }
}
