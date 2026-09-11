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
  const { schoolCode, serial } = await params;
  const { sig } = await searchParams;
  const code = schoolCode.trim().toLowerCase();
  const directory = await rawDb.schoolLoginDirectory.findUnique({
    where: { uniqueCode: code },
    select: { schoolId: true, status: true },
  });

  if (!directory) {
    return <PublicIdentityCardVerificationFailure serial={serial} reason="The school encoded in this older QR is not registered in the SukuuNova verification directory." />;
  }

  const school = await withTenant(directory.schoolId, (tx) => tx.school.findUnique({
    where: { id: directory.schoolId },
    select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true },
  }));

  if (!school) {
    return <PublicIdentityCardVerificationFailure serial={serial} reason="The issuing school record could not be loaded for this credential." />;
  }
  if (directory.status !== "active") {
    return <PublicIdentityCardVerificationFailure school={school} serial={serial} reason="The issuing school is not currently active in SukuuNova, so this credential cannot be accepted as current." />;
  }
  if (!sig) {
    return <PublicIdentityCardVerificationFailure school={school} serial={serial} reason="This older QR is missing its signed verification value. Ask the school to print the current version of the ID card." />;
  }

  const result = await publicIdentityCardBySerial(directory.schoolId, serial, sig);
  if (!result) {
    return <PublicIdentityCardVerificationFailure school={school} serial={serial} reason="This older QR signature no longer matches the live credential. The card may have been reissued, altered or superseded." />;
  }

  return <PublicIdentityCardVerification school={school} card={result.card} state={result.state} />;
}
