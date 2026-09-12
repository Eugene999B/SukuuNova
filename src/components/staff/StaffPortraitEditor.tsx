"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VerifiedPortraitCapture } from "@/components/portraits/VerifiedPortraitCapture";

export function StaffPortraitEditor({ staffId, staffName, initialPhoto }: { staffId: string; staffName: string; initialPhoto: string | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState(initialPhoto ?? "");
  const [busy, setBusy] = useState(false);

  async function save(photoData: string | null, verificationToken?: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/school/staff/${encodeURIComponent(staffId)}/photo`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoData, verificationToken: verificationToken || null }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not update staff portrait.");
      setPreview(photoData ?? "");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <VerifiedPortraitCapture
    target="staff"
    subjectLabel={staffName || "staff member"}
    value={preview}
    busy={busy}
    onUse={(image, verificationToken) => save(image, verificationToken)}
    onRemove={() => save(null)}
    removeLabel="Remove portrait"
    allowFileFallback
  />;
}
