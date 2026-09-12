import {
  PublicIdentityCardVerification,
  PublicIdentityCardVerificationFailure,
} from "@/components/PublicIdentityCardVerification";
import { publicIdentityCardBySerial } from "@/lib/identity-card-service";
import { rawDb, withTenant } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function IdentityCardVerificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolCode: string; serial: string }>;
  searchParams: Promise<{ sig?: string }>;
}) {
  let scannedSerial: string | null = null;
  let logSchoolCode = "unknown";

  try {
    const { schoolCode, serial } = await params;
    const { sig } = await searchParams;
    const trimmedSchoolCode = schoolCode.trim();
    const trimmedSerial = serial.trim();
    scannedSerial = trimmedSerial.slice(0, 160) || null;
    logSchoolCode = trimmedSchoolCode.slice(0, 64) || "unknown";

    if (!trimmedSchoolCode || trimmedSchoolCode.length > 64 || !trimmedSerial || trimmedSerial.length > 160) {
      return <PublicIdentityCardVerificationFailure serial={scannedSerial} reason="This verification link is malformed or incomplete. This credential is INVALID / UNVERIFIED." />;
    }

    const code = trimmedSchoolCode.toLowerCase();
    const directory = await rawDb.schoolLoginDirectory.findUnique({
      where: { uniqueCode: code },
      select: { schoolId: true, status: true },
    });

    if (!directory) {
      return <PublicIdentityCardVerificationFailure serial={scannedSerial} reason="The school encoded in this older QR is not registered in the SukuuNova verification directory. This credential is UNVERIFIED." />;
    }

    const school = await withTenant(directory.schoolId, (tx) => tx.school.findUnique({
      where: { id: directory.schoolId },
      select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true },
    }));

    if (!school) {
      return <PublicIdentityCardVerificationFailure serial={scannedSerial} reason="The issuing school record could not be loaded for this credential. This credential is UNVERIFIED." />;
    }
    if (directory.status !== "active") {
      return <PublicIdentityCardVerificationFailure school={school} serial={scannedSerial} reason="The issuing school is not currently active in SukuuNova, so this credential is INVALID / UNVERIFIED as a current school ID." />;
    }
    if (!sig || !/^[a-fA-F0-9]{64}$/.test(sig.trim())) {
      return <PublicIdentityCardVerificationFailure school={school} serial={scannedSerial} reason="This older QR is missing or contains an invalid signed verification value. This credential is INVALID / UNVERIFIED." />;
    }

    const result = await publicIdentityCardBySerial(directory.schoolId, trimmedSerial, sig);
    if (!result) {
      return <PublicIdentityCardVerificationFailure school={school} serial={scannedSerial} reason="This older QR signature no longer matches the live credential. The card may have been reissued, altered or superseded and is INVALID / UNVERIFIED." />;
    }
    if (!result.card.personName?.trim()) {
      return <PublicIdentityCardVerificationFailure school={school} serial={scannedSerial} reason="The signed credential exists, but its holder record is no longer available. This credential is INVALID / UNVERIFIED." />;
    }

    return <PublicIdentityCardVerification school={school} card={result.card} state={result.state} />;
  } catch (error) {
    console.error("[identity-card-verification] legacy verification failed safely", {
      schoolCode: logSchoolCode,
      serial: scannedSerial,
      error: error instanceof Error ? error.message : "Unknown verification error",
    });
    return <PublicIdentityCardVerificationFailure serial={scannedSerial} reason="SukuuNova could not complete the live credential check safely. This credential is UNVERIFIED and must not be accepted until the issuing school confirms it." />;
  }
}
