import { notFound } from "next/navigation";
import { PublicIdentityCardVerification } from "@/components/PublicIdentityCardVerification";
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
  if (!directory || directory.status !== "active") notFound();

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
    return rows[0] && school ? { card: rows[0], school } : null;
  });
  if (!candidate || !verifyIdentityCardCompactToken(candidate.card, token)) notFound();

  const result = await publicIdentityCardBySerial(
    directory.schoolId,
    serial,
    identityCardSignature(candidate.card),
  );
  if (!result) notFound();

  return <PublicIdentityCardVerification school={candidate.school} card={result.card} state={result.state} />;
}
