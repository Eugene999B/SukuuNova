import type { TenantDb } from "./db";
import { AppError } from "./errors";

/** ON CONFLICT keeps the transaction usable when a terminal retries a scan. */
export async function claimDeviceAttendanceReceipt(tx: TenantDb, input: {
 schoolId:string;deviceId:string;idempotencyKey:string;nonce:string;capturedAt:Date;
}) {
 const created=await tx.deviceAttendanceReceipt.createMany({data:[input],skipDuplicates:true});
 if(created.count===1)return "claimed" as const;
 const existing=await tx.deviceAttendanceReceipt.findFirst({
  where:{schoolId:input.schoolId,deviceId:input.deviceId,idempotencyKey:input.idempotencyKey},select:{id:true},
 });
 if(existing)return "duplicate" as const;
 throw new AppError("Device nonce has already been used.",401,"REPLAY_DETECTED");
}
