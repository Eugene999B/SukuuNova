import * as React from "react";
import {
  PublicIdentityCardVerification,
  PublicIdentityCardVerificationFailure,
} from "@/components/PublicIdentityCardVerification";
import { rawDb, withTenant } from "@/lib/db";
import {
  identityCardSignature,
  publicIdentityCardBySerial,
} from "@/lib/identity-card-service";
import {
  isIdentityCardCompactToken,
  verifyIdentityCardCompactToken,
} from "@/lib/identity-card-compact-verification";

export const dynamic = "force-dynamic";

type CanonicalCard = {
  schoolId: string;
  serial: string;
  personType: "student" | "staff";
  issuedAt: Date;
  expiresAt: Date;
  version: number;
};

function verificationFailure(serial: string | null, reason: string) {
  return React.createElement(PublicIdentityCardVerificationFailure, { serial, reason });
}

export default async function CompactIdentityCardVerificationPage({
  params,
}: {
  params: Promise<{ schoolCode: string; serial: string; token: string }>;
}) {
  let scannedSerial: string | null = null;
  let logSchoolCode = "unknown";

  try {
    const { schoolCode, serial, token } = await params;
    const trimmedSchoolCode = schoolCode.trim();
    const trimmedSerial = serial.trim();
    const trimmedToken = token.trim();
    scannedSerial = trimmedSerial.slice(0, 160) || null;
    logSchoolCode = trimmedSchoolCode.slice(0, 64) || "unknown";

    if (!trimmedSchoolCode || trimmedSchoolCode.length > 64 || !trimmedSerial || trimmedSerial.length > 160 || !isIdentityCardCompactToken(trimmedToken)) {
      return verificationFailure(scannedSerial, "This QR is malformed or incomplete. It is INVALID / UNVERIFIED and must not be accepted as a current school credential.");
    }

    const code = trimmedSchoolCode.toLowerCase();
    const directory = await rawDb.schoolLoginDirectory.findUnique({
      where: { uniqueCode: code },
      select: { schoolId: true, status: true },
    });

    if (!directory) {
      return verificationFailure(scannedSerial, "The school encoded in this QR is not registered in the SukuuNova verification directory. This credential is UNVERIFIED.");
    }
    if (directory.status !== "active") {
      return verificationFailure(scannedSerial, "The issuing school is not currently active in SukuuNova, so this credential is INVALID / UNVERIFIED as a current school ID.");
    }

    const candidate = await withTenant(directory.schoolId, async (tx) => {
      const rows = await tx.$queryRawUnsafe<CanonicalCard[]>(
        `SELECT "schoolId","serial","personType","issuedAt","expiresAt","version"
         FROM "IdentityCard"
         WHERE "schoolId"=$1 AND "serial"=$2
         LIMIT 1`,
        directory.schoolId,
        trimmedSerial,
      );
      const school = await tx.school.findUnique({
        where: { id: directory.schoolId },
        select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true },
      });
      return { card: rows[0] ?? null, school };
    });

    if (!candidate.school) {
      return verificationFailure(scannedSerial, "The issuing school record could not be loaded for this QR. This credential is UNVERIFIED.");
    }
    if (!candidate.card) {
      return <PublicIdentityCardVerificationFailure school={candidate.school} serial={scannedSerial} reason="No identity card with this credential serial exists in the issuing school's live records. This credential is INVALID / UNVERIFIED." />;
    }
    if (!verifyIdentityCardCompactToken(candidate.card, trimmedToken)) {
      return <PublicIdentityCardVerificationFailure school={candidate.school} serial={scannedSerial} reason="The signed QR token does not match this credential. The code may be damaged, incomplete, altered or from an unknown card. This credential is INVALID / UNVERIFIED." />;
    }

    const result = await publicIdentityCardBySerial(
      directory.schoolId,
      trimmedSerial,
      identityCardSignature(candidate.card),
    );
    if (!result) {
      return <PublicIdentityCardVerificationFailure school={candidate.school} serial={scannedSerial} reason="The QR signature was recognised, but the live credential record could not be verified. This credential is UNVERIFIED until the school issues a current replacement." />;
    }
    if (!result.card.personName?.trim()) {
      return <PublicIdentityCardVerificationFailure school={candidate.school} serial={scannedSerial} reason="The signed credential exists, but its holder record is no longer available. This credential is INVALID / UNVERIFIED." />;
    }

    return <PublicIdentityCardVerification school={candidate.school} card={result.card} state={result.state} />;
  } catch (error) {
    console.error("[identity-card-verification] compact verification failed safely", {
      schoolCode: logSchoolCode,
      serial: scannedSerial,
      error: error instanceof Error ? error.message : "Unknown verification error",
    });
    return verificationFailure(scannedSerial, "SukuuNova could not complete the live credential check safely. This credential is UNVERIFIED and must not be accepted until the issuing school confirms it.");
  }
}
