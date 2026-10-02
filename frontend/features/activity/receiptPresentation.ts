import { CAMEL_PATH } from '@/shared/components/CaravanStamp';

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
  /// Whether the movement is complete; a pending one gets the neutral badge.
  done?: boolean;
  dateLabel?: string;
  network?: string;
  networkLabel?: string;
  verifyTitle?: string;
  /// The explorer link a reader can type in; an image cannot carry a link.
  verifyUrl?: string;
  footnote?: string;
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
  return shortenDealIds(redactWalletAddresses(value))
    .replace(/\b(buyer|seller) agent wallet\b/gi, '$1 trade account')
    .replace(/\b(buyer|seller) agent\b/gi, '$1 trade account')
    .replace(/\bsign-in wallet\b/gi, 'main account')
    .replace(/\bbaseSepolia\b/g, 'Base Sepolia')
    .replace(/\barbitrumSepolia\b/g, 'Arbitrum Sepolia')
    .replace(/\boptimismSepolia\b/g, 'Optimism Sepolia')
    .replace(/\bpolygonAmoy\b/g, 'Polygon Amoy')
    .replace(/\bavalancheFuji\b/g, 'Avalanche Fuji')
    .replace(/\bunichainSepolia\b/g, 'Unichain Sepolia')
    .replace(/Escrow funded and protection activated/gi, 'USDC secured and protection activated');
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const FONT = "'General Sans', 'Helvetica Neue', Arial, sans-serif";
const MONO = "Consolas, 'SFMono-Regular', monospace";

/// The shareable image of a receipt: the same order and facts as the card in
/// the app. Amount first, one sentence, rows of facts, then the proof line and
/// the caravan stamp.
export function buildReceiptSvg(data: ReceiptExportData): string {
  // A movement with no Karwan reference still settled somewhere: the hash takes
  // the identifier row, and the note about the missing reference stays out of
  // the value slot. Both print when both exist.
  const rows: Array<{ label: string; value: string; mono: boolean }> = [
    { label: data.dateLabel ?? 'Date', value: data.date, mono: false },
    ...(data.network ? [{ label: data.networkLabel ?? 'Network', value: data.network, mono: false }] : []),
    data.reference
      ? { label: data.referenceLabel, value: data.reference, mono: true }
      : data.transaction
        ? { label: data.transaction.label, value: data.transaction.value, mono: true }
        : { label: data.referenceLabel, value: data.referenceNone, mono: false },
    ...(data.reference && data.transaction ? [{ label: data.transaction.label, value: data.transaction.value, mono: true }] : []),
  ];
  const sentence = wrapSvgText(readableMovementText(data.summary), 58).slice(0, 3);
  const amountMatch = (data.amount ?? '').match(/^(.*?)\s*(USDC)$/);
  const amountWhole = amountMatch ? amountMatch[1]! : data.amount;
  const amountUnit = amountMatch ? amountMatch[2]! : '';
  const tone = /fail/i.test(data.status) ? ['#F6E1E0', '#7a2421'] : data.done === false ? ['#EEF1F4', '#4b545d'] : ['#E7F0CF', '#33410f'];
  const pillWidth = Math.max(96, data.status.length * 11 + 40);

  let y = 232;
  const parts: string[] = [];
  parts.push(`<text x="88" y="${y}" fill="#5d666f" font-family="${FONT}" font-size="22">${escapeSvg(data.title)}</text>`);
  if (amountWhole) {
    y += 82;
    parts.push(`<text x="88" y="${y}" fill="#16202A" font-family="${FONT}" font-size="80" font-weight="600" letter-spacing="-2">${escapeSvg(amountWhole)}<tspan dx="14" font-size="28" font-weight="500" fill="#5d666f" letter-spacing="0">${escapeSvg(amountUnit)}</tspan></text>`);
  }
  y += 52;
  parts.push(`<text x="88" y="${y}" fill="#2c353e" font-family="${FONT}" font-size="25">${sentence.map((line, i) => `<tspan x="88" dy="${i === 0 ? 0 : 34}">${escapeSvg(line)}</tspan>`).join('')}</text>`);
  y += (sentence.length - 1) * 34 + 40;
  parts.push(`<line x1="88" y1="${y}" x2="1112" y2="${y}" stroke="#E3E6E1" stroke-width="2"/>`);
  for (const row of rows) {
    y += 58;
    parts.push(`<text x="88" y="${y}" fill="#5d666f" font-family="${FONT}" font-size="23">${escapeSvg(row.label)}</text>`);
    parts.push(`<text x="1112" y="${y}" text-anchor="end" fill="#16202A" font-family="${row.mono ? MONO : FONT}" font-size="${row.mono ? 22 : 23}" font-weight="${row.mono ? 400 : 500}">${escapeSvg(row.value)}</text>`);
    y += 24;
    parts.push(`<line x1="88" y1="${y}" x2="1112" y2="${y}" stroke="#E3E6E1" stroke-width="2"/>`);
  }
  y += 92;
  const proofTitle = data.verifyTitle ?? '';
  const proofBody = data.verifyUrl ?? '';
  if (proofTitle || proofBody) {
    parts.push(`<text x="88" y="${y - 22}" fill="#16202A" font-family="${FONT}" font-size="21" font-weight="600">${escapeSvg(proofTitle)}</text>`);
    if (proofBody) parts.push(`<text x="88" y="${y + 10}" fill="#5d666f" font-family="${MONO}" font-size="16">${escapeSvg(proofBody.length > 70 ? `${proofBody.slice(0, 67)}...` : proofBody)}</text>`);
  }
  parts.push(caravanStampSvg(1112 - 116, y - 96, 116));
  // The image carries the transaction as its identity; the apology for a
  // missing reference belongs to the panel, not the shared picture.
  const notes = [data.footnote ?? null].filter((note): note is string => !!note);
  y += 60;
  for (const note of notes.flatMap((line) => wrapSvgText(line, 90))) {
    parts.push(`<text x="600" y="${y}" text-anchor="middle" fill="#8a929a" font-family="${FONT}" font-size="18">${escapeSvg(note)}</text>`);
    y += 28;
  }
  const height = y + 60;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
    <rect width="1200" height="${height}" fill="#E4E8ED"/>
    <rect x="36" y="36" width="1128" height="${height - 72}" rx="40" fill="#FBFBF8"/>
    <rect x="88" y="96" width="44" height="44" rx="12" fill="#16202A"/>
    <text x="110" y="127" text-anchor="middle" fill="#AFC95B" font-family="${FONT}" font-size="24" font-weight="700">M</text>
    <text x="148" y="129" fill="#16202A" font-family="${FONT}" font-size="30" font-weight="700">Karwan</text>
    <rect x="${1112 - pillWidth}" y="98" width="${pillWidth}" height="40" rx="20" fill="${tone[0]}"/>
    <text x="${1112 - pillWidth / 2}" y="125" text-anchor="middle" fill="${tone[1]}" font-family="${FONT}" font-size="19" font-weight="600">${escapeSvg(data.status)}</text>
    ${parts.join('\n    ')}
  </svg>`;
}

/// The caravan stamp at (x, y), `size` wide: a dotted seal around the camel.
function caravanStampSvg(x: number, y: number, size: number): string {
  const s = size / 120;
  return `<g transform="translate(${x} ${y}) scale(${s})">
      <circle cx="60" cy="60" r="56" fill="none" stroke="#16202A" stroke-width="3" stroke-dasharray="3 6"/>
      <g transform="translate(5 14) scale(0.9)">
        <g fill="#16202A"><path d="${CAMEL_PATH}"/><rect x="31" y="64" width="7" height="26" rx="3"/><rect x="42" y="64" width="7" height="26" rx="3"/><rect x="71" y="64" width="7" height="26" rx="3"/><rect x="82" y="64" width="7" height="26" rx="3"/></g>
        <path d="M27 55c-7 3-9 9-7 16" stroke="#16202A" stroke-width="4" fill="none" stroke-linecap="round"/>
        <rect x="45" y="14" width="22" height="15" rx="3" fill="#AFC95B"/>
      </g>
    </g>`;
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
  return lines.length ? lines : ['-'];
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
    context.fillStyle = '#E4E8ED';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename);
      URL.revokeObjectURL(svgUrl);
    }, 'image/png');
  };
  image.src = svgUrl;
}
