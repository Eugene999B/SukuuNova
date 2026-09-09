const GSM_BASIC = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"));
const GSM_EXTENSION = new Set(["^", "{", "}", "\\", "[", "~", "]", "|", "€", "\f"]);

export type SmsSegmentEstimate = {
  encoding: "GSM-7" | "UCS-2";
  units: number;
  segments: number;
  singleSegmentLimit: number;
  concatenatedSegmentLimit: number;
  remainingInSegment: number;
};

export function estimateSmsSegments(message: string): SmsSegmentEstimate {
  let septets = 0;
  let gsm = true;
  for (const char of message) {
    if (GSM_BASIC.has(char)) septets += 1;
    else if (GSM_EXTENSION.has(char)) septets += 2;
    else { gsm = false; break; }
  }

  if (gsm) {
    const limit = septets <= 160 ? 160 : 153;
    const segments = Math.max(1, Math.ceil(septets / limit));
    return {
      encoding: "GSM-7",
      units: septets,
      segments,
      singleSegmentLimit: 160,
      concatenatedSegmentLimit: 153,
      remainingInSegment: Math.max(0, segments * limit - septets),
    };
  }

  // Providers generally meter Unicode SMS using UTF-16/UCS-2 code units.
  // JavaScript string length is UTF-16 code units, so surrogate pairs count as two.
  const codeUnits = message.length;
  const limit = codeUnits <= 70 ? 70 : 67;
  const segments = Math.max(1, Math.ceil(codeUnits / limit));
  return {
    encoding: "UCS-2",
    units: codeUnits,
    segments,
    singleSegmentLimit: 70,
    concatenatedSegmentLimit: 67,
    remainingInSegment: Math.max(0, segments * limit - codeUnits),
  };
}
