import { notFound } from "next/navigation";
import { PublicIdentityCardVerification } from "@/components/PublicIdentityCardVerification";
import { publicIdentityCardBySerial } from "@/lib/identity-card-service";
import { rawDb, withTenant } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function IdentityCardVerificationPage({
  params,
  searchParams
}: {
  params: Promise<{ schoolCode: string; serial: string }>;
  searchParams: Promise<{ sig?: string }>;
}) {
  const { schoolCode, serial } = await params;
  const { sig } = await searchParams;
  const code = schoolCode.trim().toLowerCase();
  const directory = await rawDb.schoolLoginDirectory.findUnique({ where: { uniqueCode: code }, select: { schoolId: true, status: true } });
  if (!directory || directory.status !== "active" || !sig) notFound();

  const [result, school] = await Promise.all([
    publicIdentityCardBySerial(directory.schoolId, serial, sig),
    withTenant(directory.schoolId, (tx) => tx.school.findUnique({
      where: { id: directory.schoolId },
      select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true },
    })),
  ]);
  if (!result || !school) notFound();

  return <PublicIdentityCardVerification school={school} card={result.card} state={result.state} />;
}
