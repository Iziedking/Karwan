export interface ReceiptExportData {
  title: string;
  summary: string;
  reference: string | null;
  amount: string | null;
  status: string;
  date: string;
  /// The transaction the movement settled in, already shortened, with its label
  /// so the exported image and the panel agree in every locale. An exported
  /// image cannot carry a link, so the hash itself has to be on the paper.
  transaction?: { label: string; value: string };
  referenceLabel: string;
  referenceNone: string;
  historicalNote: string;
  sharedNote: string;
}

/// Wallet addresses are proof metadata, not portable receipt identity. Keep
/// them out of the reader-facing ledger and any export surface.
export function redactWalletAddresses(value: string): string {
  return value.replace(/\b0x[a-fA-F0-9]{40}\b/g, 'counterparty');
}

/// Deal ids are 32-byte hashes, and printing all 66 characters of one inside a
/// sentence is what broke the ledger on a phone: "Released milestone 2 on deal
/// 0x6087..." ran to three wrapped lines and pushed the actions off the row, and
/// the same sentence overflowed the shared receipt. Shortened to head and tail,
/// which is how the id is quoted everywhere else in the product and still enough
/// to match a deal against its page.
///
/// Distinct from redaction: nothing is hidden here. A 32-byte deal id is public
/// on chain, it is simply too long to read inside a sentence.
export function shortenDealIds(value: string): string {
  // 48 hex digits and up, deliberately not exactly 64: it must not touch a
  // 40-digit wallet address (that is the redactor's job and it runs first), and
  // an id that reaches this text a few digits short of a full hash should still
  // be shortened rather than printed whole.
  return value.replace(/\b0x[a-fA-F0-9]{48,}\b/g, shortenHash);
}

/// One hash on its own, head and tail. Shares its formatting with the
/// in-sentence shortener above so a deal id quoted in prose and the same id
/// shown as a field value can never be abbreviated two different ways.
export function shortenHash(hash: string): string {
  const value = hash.trim();
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

/// The one text pipeline for anything written at record time: strip the wallet
/// addresses, shorten the hashes. Every surface that renders a movement summary
/// goes through this, so the ledger row, the receipt panel and the exported
/// image can never disagree about what the sentence says.
export function readableMovementText(value: string): string {
  return shortenDealIds(redactWalletAddresses(value));
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildReceiptSvg(data: ReceiptExportData): string {
  // A movement with no Karwan reference is not a movement with no identity: it
  // settled in a transaction, and that hash is what a reader can verify. So the
  // identifier row falls back to the hash, and the apology for the missing
  // reference leaves the value slot entirely.
  //
  // The row this replaces printed "NETWORK PROOF" as both the label and the
  // value, because the label was being passed in as the value. A field whose
  // value is its own name is worse than no field.
  const rows: [string, string][] = [
    ['MOVEMENT', readableMovementText(data.summary)],
    data.reference
      ? [data.referenceLabel, data.reference]
      : data.transaction
        ? [data.transaction.label, data.transaction.value]
        : [data.referenceLabel, data.referenceNone],
    // Both, when both exist: the Karwan reference is what support quotes, the
    // hash is what anyone can check on chain.
    ...(data.reference && data.transaction
      ? [[data.transaction.label, data.transaction.value] as [string, string]]
      : []),
  ];
  let detailY = 432;
  const detailMarkup = rows
    .map(([label, value]) => {
      const lines = wrapSvgText(value, 54).slice(0, 3);
      const markup = svgField(label, lines, detailY);
      detailY += 82 + (lines.length - 1) * 27;
      return markup;
    })
    .join('');
  const noteLines = wrapSvgText(data.sharedNote, 92);
  const noteY = detailY + 16;
  const height = noteY + noteLines.length * 26 + 104;
  const noteMarkup = noteLines
    .map((line, index) => `<tspan x="88" dy="${index === 0 ? 0 : 26}">${escapeSvg(line)}</tspan>`)
    .join('');
  const watermarkMarkup = [
    [170, Math.min(548, height - 180)],
    [730, Math.min(628, height - 120)],
    [230, Math.min(742, height - 64)],
  ]
    .map(
      ([x, y]) =>
        `<text x="${x}" y="${y}" fill="#eef0e8" font-family="Arial, sans-serif" font-size="98" font-weight="800" letter-spacing="-4" opacity="0.82">KARWAN.</text>`,
    )
    .join('');
  const scallops = Array.from(
    { length: 30 },
    (_, index) =>
      `<circle cx="${54 + index * 38}" cy="48" r="18"/><circle cx="${54 + index * 38}" cy="${height - 48}" r="18"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
    <rect width="1200" height="100%" fill="#eef0e8"/>
    <rect x="36" y="48" width="1128" height="${height - 96}" rx="26" fill="#ffffff" stroke="#d9ddd1"/>
    ${watermarkMarkup}
    <rect x="88" y="82" width="56" height="56" rx="12" fill="#0e0e0e"/>
    <path d="M104 124 L111 98 L116 113 L121 98 L128 124" fill="none" stroke="#AFC95B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="168" y="119" fill="#10110f" font-family="Arial, sans-serif" font-size="31" font-weight="800" letter-spacing="1.2">KARWAN<tspan fill="#afc95b">.</tspan></text>
    <text x="1112" y="118" text-anchor="end" fill="#4e554c" font-family="Arial, sans-serif" font-size="22">Transaction receipt</text>
    <line x1="88" y1="176" x2="1112" y2="176" stroke="#d9ddd1"/>
    <text x="88" y="224" fill="#767a74" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" letter-spacing="3">[:RECEIPT:]</text>
    <text x="600" y="300" text-anchor="middle" fill="#10110f" font-family="Arial, sans-serif" font-size="48" font-weight="800" letter-spacing="-1">${escapeSvg(data.amount ?? '—')}</text>
    <text x="600" y="344" text-anchor="middle" fill="#10110f" font-family="Arial, sans-serif" font-size="25">${escapeSvg(data.status)}</text>
    <text x="600" y="378" text-anchor="middle" fill="#767a74" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" letter-spacing="1">${escapeSvg(data.date)}</text>
    <line x1="88" y1="410" x2="1112" y2="410" stroke="#d9ddd1"/>
    ${detailMarkup}
    <line x1="88" y1="${noteY - 24}" x2="1112" y2="${noteY - 24}" stroke="#d9ddd1"/>
    <text x="88" y="${noteY}" fill="#767a74" font-family="Arial, sans-serif" font-size="17">${noteMarkup}</text>
    <g fill="#eef0e8">${scallops}</g>
  </svg>`;
}

function wrapSvgText(value: string, maxChars: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['—'];
}

function svgField(label: string, lines: string[], y: number): string {
  const valueMarkup = lines
    .slice(0, 3)
    .map((line, index) => `<tspan x="1112" dy="${index === 0 ? 0 : 27}">${escapeSvg(line)}</tspan>`)
    .join('');
  return `<text x="88" y="${y}" fill="#767a74" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" letter-spacing="2">${escapeSvg(label)}</text>
    <text x="1112" y="${y + 34}" text-anchor="end" fill="#10110f" font-family="Arial, sans-serif" font-size="24" font-weight="700">${valueMarkup}</text>`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadReceiptImage(data: ReceiptExportData, filename: string): void {
  const svg = buildReceiptSvg(data);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = 1200 * scale;
    const svgHeight = image.naturalHeight || 960;
    canvas.height = svgHeight * scale;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#eef0e8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename);
      URL.revokeObjectURL(svgUrl);
    }, 'image/png');
  };
  image.src = svgUrl;
}
