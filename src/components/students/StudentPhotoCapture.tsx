"use client";

import { useState } from "react";
import { VerifiedPortraitCapture } from "@/components/portraits/VerifiedPortraitCapture";

export function StudentPhotoCapture() {
  const [photo, setPhoto] = useState("");
  const [verificationToken, setVerificationToken] = useState("");

  return <>
    <VerifiedPortraitCapture
      target="student"
      subjectLabel="learner"
      value={photo}
      onUse={(image, token) => {
        setPhoto(image);
        setVerificationToken(token);
      }}
      allowFileFallback
    />
    <input type="hidden" name="photoData" value={photo} />
    <input type="hidden" name="photoVerificationToken" value={verificationToken} />
    <p className="field-help">A captured portrait is accepted only after server-side face verification and your review. The official portrait can later be enrolled for biometric attendance after the school&apos;s existing consent controls are completed.</p>
  </>;
}
