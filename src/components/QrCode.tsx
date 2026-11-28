import QRCode from "qrcode";

/** Draws a QR code as plain SVG shapes, so no image or script from elsewhere is needed. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 4;
  const cells: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(y, x)) cells.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  const size = n + quiet * 2;
  return (
    <svg
      className="qr"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}
