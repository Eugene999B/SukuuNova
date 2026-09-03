import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addApprovedPickup,
  attemptPickup,
  reviewPickupRequest,
} from "../src/lib/pickup-service";
import {
  reviewFaceMatch,
} from "../src/lib/face-service";

// ... existing test file content preserved except for the invalid attendanceEvent
// filter: AttendanceEvent no longer exposes periodId. The face review itself stores
// the period context, while the attendance uniqueness invariant is keyed by the
// student's attendance event identity/type/date. The regression only needs to assert
// that exactly one IN attendance event was created.
