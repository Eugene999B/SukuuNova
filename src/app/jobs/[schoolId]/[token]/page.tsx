import PublicJobApplication from "@/components/PublicJobApplication";

export default async function PublicJobPage({ params }: { params: Promise<{ schoolId: string; token: string }> }) {
  const { schoolId, token } = await params;
  return <PublicJobApplication schoolId={schoolId} token={token} />;
}
