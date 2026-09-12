"use client";

import { useState } from "react";
import { VerifiedPortraitCapture } from "@/components/portraits/VerifiedPortraitCapture";

export function AdmissionPortraitField() {
  const [photoData, setPhotoData] = useState("");
  const [verificationToken, setVerificationToken] = useState("");

  return (
    <div className="portrait-field">
      <VerifiedPortraitCapture
        target="student"
        subjectLabel="admission applicant"
        value={photoData || null}
        allowFileFallback
        onUse={(image, token) => {
          setPhotoData(image);
          setVerificationToken(token);
        }}
        onRemove={() => {
          setPhotoData("");
          setVerificationToken("");
        }}
      />
      <input type="hidden" name="photoData" value={photoData} />
      <input type="hidden" name="photoVerificationToken" value={verificationToken} />
      <span className="portrait-field-note">The portrait is attached to the application and becomes the learner&apos;s official profile photo only after final enrolment.</span>
    </div>
  );
}
