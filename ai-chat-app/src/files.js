import * as FS from 'expo-file-system';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

export const DIR = FS.documentDirectory + 'files/';
const MAGIC = new Uint8Array([65, 73, 69, 78, 67, 49]); // "AIENC1"
const DEFAULT_READ_CHARS = 14000;
const MAX_READ_CHARS = 24000;

const toBytes = (b64) => {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
};
const toB64 = (u) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
const safe = (n) => String(n).replace(/[\/\\]/g, '_');
const path = (n) => DIR + safe(n);

async function ensureDir() {
  const i = await FS.getInfoAsync(DIR);
  if (!i.exists) await FS.makeDirectoryAsync(DIR, { intermediates: true });
}

export const filePath = path;

export async function saveAttachment(uri, name) {
  await ensureDir();
  await FS.copyAsync({ from: uri, to: path(name) });
  return safe(name);
}

export async function listFiles() {
  await ensureDir();
  return FS.readDirectoryAsync(DIR);
}

export async function writeTextFile(name, content) {
  await ensureDir();
  await FS.writeAsStringAsync(path(name), content);
  return safe(name);
}

// Đọc file thành dạng AI hiểu được: text hoặc ảnh
export async function readFileForAI(name, options = {}) {
  const p = path(name);
  const info = await FS.getInfoAsync(p);
  if (!info.exists) return { type: 'error', text: `Không tìm thấy file "${name}"` };
  const ext = name.split('.').pop().toLowerCase();
  const start = Math.max(0, Number(options.startChar) || 0);
  const limit = Math.min(MAX_READ_CHARS, Math.max(1000, Number(options.maxChars) || DEFAULT_READ_CHARS));
  const makeChunk = (value) => {
    const text = String(value || '');
    const chunk = text.slice(start, start + limit);
    return { type: 'text', content: chunk, text: chunk + (start + chunk.length < text.length
      ? `\n\n[Đoạn ${start + 1}-${start + chunk.length}/${text.length}. Còn nội dung; gọi read_file tiếp với start_char=${start + chunk.length}.]`
      : `\n\n[Đã đọc đến cuối file. Tổng ${text.length} ký tự.]`), totalChars: text.length, nextChar: start + chunk.length };
  };

  if (ext === 'enc') {
    return { type: 'text', text: `File "${name}" đã được mã hóa. Hãy hỏi người dùng mật khẩu rồi gọi decrypt_file.` };
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    const b64 = await FS.readAsStringAsync(p, { encoding: FS.EncodingType.Base64 });
    return { type: 'image', dataUrl: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}` };
  }
  if (ext === 'docx') {
    const b64 = await FS.readAsStringAsync(p, { encoding: FS.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const xml = await zip.file('word/document.xml').async('string');
    const text = xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    return makeChunk(text);
  }
  if (['xlsx', 'xls', 'xlsm'].includes(ext)) {
    const b64 = await FS.readAsStringAsync(p, { encoding: FS.EncodingType.Base64 });
    const wb = XLSX.read(b64, { type: 'base64' });
    const text = wb.SheetNames.map((n) => `## Sheet: ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n');
    return makeChunk(text);
  }
  if (ext === 'zip') {
    return { type: 'text', text: `"${name}" là file ZIP. Dùng list_zip để xem nội dung, extract_zip để giải nén rồi read_file từng file.` };
  }
  if (ext === 'pdf') {
    return { type: 'error', text: 'Chưa hỗ trợ đọc PDF trực tiếp trên máy (cần thêm backend hoặc thư viện OCR).' };
  }
  // Còn lại: thử đọc như text UTF-8
  const t = await FS.readAsStringAsync(p);
  if ((t.match(/�/g) || []).length > 20) {
    return { type: 'error', text: `File "${name}" là file nhị phân, không đọc được thành văn bản.` };
  }
  return makeChunk(t);
}

// Tìm kiếm trong file mà không phải gửi toàn bộ nội dung lên model.
export async function searchInFile(name, query, contextChars = 350) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 'Từ khóa tìm kiếm đang trống.';
  const hits = [];
  let offset = 0;
  let total = null;
  // Quét tuần tự toàn bộ file theo từng đoạn, tránh nạp cả tài liệu lớn vào một lần.
  while ((total === null || offset < total) && hits.length < 20) {
    const r = await readFileForAI(name, { startChar: offset, maxChars: MAX_READ_CHARS });
    if (r.type !== 'text') return r.text || 'Không thể tìm kiếm file này.';
    total = r.totalChars || 0;
    const chunk = r.content || '';
    const lower = chunk.toLowerCase();
    let at = 0;
    while ((at = lower.indexOf(q, at)) !== -1 && hits.length < 20) {
      const a = Math.max(0, at - contextChars);
      const b = Math.min(chunk.length, at + q.length + contextChars);
      hits.push(`Vị trí khoảng ${offset + at}: ...${chunk.slice(a, b)}...`);
      at += Math.max(1, q.length);
    }
    if (!chunk.length || r.nextChar <= offset) break;
    offset = r.nextChar;
  }
  return hits.length
    ? `Tìm thấy ${hits.length} vị trí trong file${total !== null ? ` (${total} ký tự đã quét)` : ''}:\n\n${hits.join('\n\n---\n\n')}`
    : `Không tìm thấy từ khóa trong ${total || offset} ký tự đã quét.`;
}

// Mã hóa AES-256-GCM, khóa dẫn xuất từ mật khẩu bằng PBKDF2-SHA256
// Định dạng: MAGIC(6) | salt(16) | nonce(12) | ciphertext+tag
export async function encryptFile(name, password) {
  const b64 = await FS.readAsStringAsync(path(name), { encoding: FS.EncodingType.Base64 });
  const salt = Crypto.getRandomBytes(16);
  const nonce = Crypto.getRandomBytes(12);
  const key = pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  const ct = gcm(key, nonce).encrypt(toBytes(b64));
  const out = new Uint8Array(MAGIC.length + 16 + 12 + ct.length);
  out.set(MAGIC, 0); out.set(salt, 6); out.set(nonce, 22); out.set(ct, 34);
  const outName = name + '.enc';
  await FS.writeAsStringAsync(path(outName), toB64(out), { encoding: FS.EncodingType.Base64 });
  return outName;
}

export async function decryptFile(name, password) {
  const b64 = await FS.readAsStringAsync(path(name), { encoding: FS.EncodingType.Base64 });
  const data = toBytes(b64);
  if (data.length < 50 || MAGIC.some((v, i) => data[i] !== v)) {
    throw new Error('File không đúng định dạng mã hóa của app này.');
  }
  const salt = data.subarray(6, 22);
  const nonce = data.subarray(22, 34);
  const ct = data.subarray(34);
  const key = pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  let plain;
  try {
    plain = gcm(key, nonce).decrypt(ct);
  } catch {
    throw new Error('Sai mật khẩu hoặc file bị hỏng.');
  }
  const outName = name.endsWith('.enc') ? name.slice(0, -4) : name + '.dec';
  await FS.writeAsStringAsync(path(outName), toB64(plain), { encoding: FS.EncodingType.Base64 });
  return outName;
}

// ---- ZIP ----
const MAX_ZIP_ENTRIES = 300;
const MAX_ZIP_BYTES = 50 * 1024 * 1024; // tổng dung lượng giải nén tối đa

async function openZip(name) {
  const b64 = await FS.readAsStringAsync(path(name), { encoding: FS.EncodingType.Base64 });
  try {
    return await JSZip.loadAsync(b64, { base64: true });
  } catch (e) {
    throw new Error('Không mở được ZIP (file hỏng, hoặc có mật khẩu — ZIP có mật khẩu chưa được hỗ trợ).');
  }
}

export async function listZip(name) {
  const zip = await openZip(name);
  const rows = [];
  zip.forEach((p, entry) => {
    if (!entry.dir) rows.push(p);
  });
  if (!rows.length) return '(ZIP rỗng)';
  const shown = rows.slice(0, MAX_ZIP_ENTRIES);
  return shown.join('\n') + (rows.length > shown.length ? `\n...và ${rows.length - shown.length} file nữa` : '');
}

// Giải nén "phẳng": tên file = <tên zip không đuôi>__<đường dẫn với / đổi thành _>
// nên không thể ghi ra ngoài thư mục app (chống zip-slip).
export async function extractZip(name) {
  const zip = await openZip(name);
  await ensureDir();
  const base = safe(name).replace(/\.zip$/i, '');
  const entries = [];
  zip.forEach((p, entry) => { if (!entry.dir) entries.push([p, entry]); });
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP có ${entries.length} file, vượt giới hạn ${MAX_ZIP_ENTRIES}.`);
  }
  let total = 0;
  const out = [];
  for (const [p, entry] of entries) {
    const b64 = await entry.async('base64');
    total += Math.floor((b64.length * 3) / 4);
    if (total > MAX_ZIP_BYTES) throw new Error('Dung lượng giải nén vượt 50MB, đã dừng.');
    const clean = p.split('/').filter((x) => x && x !== '.' && x !== '..').join('_');
    if (!clean) continue;
    const outName = `${base}__${clean}`;
    await FS.writeAsStringAsync(path(outName), b64, { encoding: FS.EncodingType.Base64 });
    out.push(outName);
  }
  return out;
}
