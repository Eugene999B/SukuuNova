import {
  PublicIdentityCardVerification,
  PublicIdentityCardVerificationFailure,
} from "@/components/PublicIdentityCardVerification";
import { rawDb, withTenant } from "@/lib/db";
import {
  identityCardSignature,
  publicIdentityCardBySerial,
} from "@/lib/identity-card-service";
import { verifyIdentityCardCompactToken } from "@/lib/identity-card-compact-verification";

export const dynamic = "force-dynamic";

type CanonicalCard = {
  schoolId: string;
  serial: string;
  personType: "student" | "staff";
  issuedAt: Date;
  expiresAt: Date;
  version: number;
};

export default async function CompactIdentityCardVerificationPage({
  params,
}: {
  params: Promise<{ schoolCode: string; serial: string; token: string }>;
}) {
  const { schoolCode, serial, token } = await params;
  const code = schoolCode.trim().toLowerCase();
  const directory = await rawDb.schoolLoginDirectory.findUnique({
    where: { uniqueCode: code },
    select: { schoolId: true, status: true },
  });

  if (!directory) {
    return <PublicIdentityCardVerificationFailure serial={serial} reason="The school encoded in this QR is not registered in the SukuuNova verification directory." />;
  }
  if (directory.status !== "active") {
    return <PublicIdentityCardVerificationFailure serial={serial} reason="The issuing school is not currently active in SukuuNova, so this credential cannot be accepted as current." />;
  }

  const candidate = await withTenant(directory.schoolId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<CanonicalCard[]>(
      `SELECT "schoolId","serial","personType","issuedAt","expiresAt","version"
       FROM "IdentityCard"
       WHERE "schoolId"=$1 AND "serial"=$2
       LIMIT 1`,
      directory.schoolId,
      serial,
    );
    const school = await tx.school.findUnique({
      where: { id: directory.schoolId },
      select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true },
    });
    return { card: rows[0] ?? null, school };
  });

  if (!candidate.school) {
    return <PublicIdentityCardVerificationFailure serial={serial} reason="The issuing school record could not be loaded for this QR." />;
  }
  if (!candidate.card) {
    return <PublicIdentityCardVerificationFailure school={candidate.school} serial={serial} reason="No identity card with this credential serial exists in the issuing school's live records." />;
  }
  if (!verifyIdentityCardCompactToken(candidate.card, token)) {
    return <PublicIdentityCardVerificationFailure school={candidate.school} serial={serial} reason="The signed QR token does not match this credential. The code may be damaged, incomplete, altered or from an obsolete card." />;
  }

  const result = await publicIdentityCardBySerial(
    directory.schoolId,
    serial,
    identityCardSignature(candidate.card),
  );
  if (!result) {
    return <PublicIdentityCardVerificationFailure school={candidate.school} serial={serial} reason="The QR signature was recognised, but the live holder record could not be verified. Ask the school to reprint the current card." />;
  }

  return <PublicIdentityCardVerification school={candidate.school} card={result.card} state={result.state} />;
}
