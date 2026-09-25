import {expect,it} from "vitest";
import {createTenantFixture} from "./helpers";
import {withTenant} from "../src/lib/db";
import {claimDeviceAttendanceReceipt} from "../src/lib/device-attendance-receipt";
it("retries terminal scans without aborting the PostgreSQL transaction and rejects nonce reuse",async()=>{
 const f=await createTenantFixture();
 const device=await withTenant(f.schoolId,tx=>tx.device.create({data:{schoolId:f.schoolId,deviceSerial:"test-device",kind:"fingerprint",label:"Test terminal",apiKeyHash:"a".repeat(64)}}));
 const scan={schoolId:f.schoolId,deviceId:device.id,idempotencyKey:"scan-operation-1",nonce:"unique-nonce-1",capturedAt:new Date()};
 await withTenant(f.schoolId,async tx=>{
  expect(await claimDeviceAttendanceReceipt(tx,scan)).toBe("claimed");
  expect(await claimDeviceAttendanceReceipt(tx,scan)).toBe("duplicate");
  // This read fails with 25P02 if duplicate handling has aborted the transaction.
  expect(await tx.deviceAttendanceReceipt.count({where:{deviceId:device.id}})).toBe(1);
 });
 await expect(withTenant(f.schoolId,tx=>claimDeviceAttendanceReceipt(tx,{...scan,idempotencyKey:"different-operation"}))).rejects.toMatchObject({code:"REPLAY_DETECTED"});
});
