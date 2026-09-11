import encodeQR from "qr";

function qrMatrix(value: string) {
  const raw = encodeQR(value, "raw", { ecc: "medium" }) as unknown;
  return Array.isArray(raw)
    ? raw.map((row) => Array.isArray(row) ? row : Array.from(row as ArrayLike<unknown>))
    : [];
}

function qrPath(value: string, size: number) {
  const matrix = qrMatrix(value);
  const count = matrix.length;
  if (!count) return "";
  const quiet = 4;
  const unit = size / (count + quiet * 2);
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        const x = (column + quiet) * unit;
        const y = (row + quiet) * unit;
        path += `M${x.toFixed(3)} ${y.toFixed(3)}h${(unit + .025).toFixed(3)}v${(unit + .025).toFixed(3)}h-${(unit + .025).toFixed(3)}z`;
      }
    }
  }
  return path;
}

export function identityCardQrSvgDataUri(value: string) {
  const size = 260;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${qrPath(value, size)}" fill="#07131b"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
