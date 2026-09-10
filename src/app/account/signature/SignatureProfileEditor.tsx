"use client";

import { useEffect, useState } from "react";
import { SignaturePad } from "@/components/SignaturePad";
import type { SignatureVectorEvidence } from "@/lib/signature-vector";

type Payload = {
  user: { id: string; name: string };
  signature: {
    dataUrl: string;
    updatedAt: string;
    sha256?: string;
    vectorEvidence?: SignatureVectorEvidence;
    vectorSha256?: string;
  } | null;
};

export default function SignatureProfileEditor() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState("");
  const [draftEvidence, setDraftEvidence] = useState<SignatureVectorEvidence | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/account/signature", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || payload.error || "Could not load your signature.");
        setData(payload);
        setDraft(payload.signature?.dataUrl || "");
        setDraftEvidence(payload.signature?.vectorEvidence || null);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load your signature."));
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/signature", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: draft, vectorEvidence: draft ? draftEvidence : null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not save your signature.");
      setData(payload);
      setDraft(payload.signature?.dataUrl || "");
      setDraftEvidence(payload.signature?.vectorEvidence || null);
      setMessage(payload.signature ? "Your signature is saved for future school documents." : "Your saved signature has been cleared.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your signature.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="signature-card">
      <div className="signature-card-head">
        <div>
          <h2>{data?.user.name ?? "Your signature"}</h2>
          <span>{data?.signature?.updatedAt ? `Last saved ${new Date(data.signature.updatedAt).toLocaleString()}` : "No signature saved yet"}</span>
        </div>
        <span>Only you can replace this signature.</span>
      </div>
      <SignaturePad
        initialDataUrl={data?.signature?.dataUrl}
        initialVectorEvidence={data?.signature?.vectorEvidence}
        disabled={!data || busy}
        onChange={setDraft}
        onEvidenceChange={setDraftEvidence}
      />
      <div className="signature-save-row">
        <p>When a report is approved, the selected signers are copied into that report's permanent issue snapshot.</p>
        <button type="button" disabled={!data || busy} onClick={() => void save()}>{busy ? "Saving…" : draft ? "Save signature" : "Clear saved signature"}</button>
      </div>
      {message ? <div className="signature-message" role="status">{message}</div> : null}
    </section>
  );
}