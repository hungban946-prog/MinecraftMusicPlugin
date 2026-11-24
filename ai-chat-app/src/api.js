import { loadMemories, saveMemories } from './storage';
import {
  listFiles, readFileForAI, searchInFile, writeTextFile, encryptFile, decryptFile, listZip, extractZip,
} from './files';

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

const TOOLS = [
  fn('list_files', 'Liệt kê các file đang có trong app (file người dùng đính kèm và file đã tạo).'),
  fn('read_file', 'Đọc file theo từng đoạn để không bỏ sót tài liệu dài. Gọi tiếp bằng start_char được trả về cho đến khi hết file.', { name: { type: 'string' }, start_char: { type: 'integer', description: 'Vị trí ký tự bắt đầu, mặc định 0' }, max_chars: { type: 'integer', description: 'Số ký tự cần đọc, tối đa 24000' } }, ['name']),
  fn('search_file', 'Tìm từ khóa trong nội dung file và trả về các đoạn văn xung quanh kết quả.', { name: { type: 'string' }, query: { type: 'string' } }, ['name', 'query']),
  fn('create_file', 'Tạo file văn bản mới (txt, md, csv, json, html, code...).', {
    name: { type: 'string', description: 'Tên file kèm đuôi' },
    content: { type: 'string' },
  }, ['name', 'content']),
  fn('send_file', 'Gửi một file có sẵn cho người dùng để họ mở/lưu/chia sẻ.', { name: { type: 'string' } }, ['name']),
  fn('encrypt_file', 'Mã hóa file bằng mật khẩu (AES-256-GCM), tạo file <tên>.enc.', {
    name: { type: 'string' }, password: { type: 'string' },
  }, ['name', 'password']),
  fn('decrypt_file', 'Giải mã file .enc bằng mật khẩu, tạo file gốc.', {
    name: { type: 'string' }, password: { type: 'string' },
  }, ['name', 'password']),
  fn('list_zip', 'Liệt kê các file bên trong một file .zip (chưa hỗ trợ ZIP có mật khẩu).', { name: { type: 'string' } }, ['name']),
  fn('extract_zip', 'Giải nén .zip vào app. Mỗi file thành "<tên zip>__<đường dẫn>"; sau đó dùng read_file để đọc.', { name: { type: 'string' } }, ['name']),
  fn('remember', 'Lưu một thông tin quan trọng về người dùng vào bộ nhớ dài hạn.', { text: { type: 'string' } }, ['text']),
  fn('forget', 'Xóa các ký ức chứa đoạn văn bản này.', { text: { type: 'string' } }, ['text']),
];

async function exec(name, a, ctx) {
  switch (name) {
    case 'list_files': {
      const f = await listFiles();
      return f.length ? f.join('\n') : '(chưa có file)';
    }
    case 'read_file': {
      const r = await readFileForAI(a.name, { startChar: a.start_char || 0, maxChars: a.max_chars || 14000 });
      if (r.type === 'image') return 'Đây là ảnh, không đọc được qua tool. Người dùng cần đính kèm ảnh trực tiếp vào tin nhắn.';
      return r.text;
    }
    case 'search_file':
      return await searchInFile(a.name, a.query);
    case 'create_file':
      return `Đã tạo file ${await writeTextFile(a.name, a.content)}. Gọi send_file nếu muốn gửi cho người dùng.`;
    case 'send_file': {
      const files = await listFiles();
      if (!files.includes(a.name)) return `Không có file "${a.name}"`;
      if (!ctx.sentFiles.includes(a.name)) ctx.sentFiles.push(a.name);
      return `Đã gửi ${a.name} cho người dùng.`;
    }
    case 'encrypt_file':
      return `Đã mã hóa thành ${await encryptFile(a.name, a.password)}`;
    case 'decrypt_file':
      return `Đã giải mã thành ${await decryptFile(a.name, a.password)}`;
    case 'list_zip':
      return await listZip(a.name);
    case 'extract_zip': {
      const out = await extractZip(a.name);
      return `Đã giải nén ${out.length} file:\n` + out.join('\n');
    }
    case 'remember': {
      const m = await loadMemories();
      m.push({ id: Date.now().toString(36), text: a.text, at: Date.now() });
      await saveMemories(m);
      return 'Đã ghi nhớ.';
    }
    case 'forget': {
      const m = await loadMemories();
      const keep = m.filter((x) => !x.text.toLowerCase().includes(String(a.text).toLowerCase()));
      await saveMemories(keep);
      return `Đã xóa ${m.length - keep.length} ký ức.`;
    }
    default:
      return 'Tool không tồn tại';
  }
}


export async function testConnection(settings) {
  const base = String(settings.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base || !settings.apiKey || !settings.model) {
    throw new Error('Cần nhập đủ Base URL, API Key và Model.');
  }
  const url = /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: 'user', content: 'Reply with exactly: API_OK' }],
      max_tokens: 12,
    }),
  });
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch {
    throw new Error(`Phản hồi không phải JSON (${res.status}): ${raw.slice(0, 180)}`);
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${data.error?.message || data.message || raw.slice(0, 240)}`);
  if (!data?.choices?.[0]?.message) throw new Error('API đã phản hồi nhưng không đúng cấu trúc Chat Completions.');
  return data.choices[0].message.content || 'Kết nối thành công (model không trả nội dung).';
}

export async function runChat({ settings, history, memories, userContent, onStatus }) {
  const system =
    'Bạn là trợ lý AI cá nhân có nhiệm vụ đọc hiểu và phân tích sâu. Trả lời cùng ngôn ngữ với người dùng.\n' +
    'Khi phân tích tài liệu dài, không kết luận chỉ từ đoạn đầu: dùng list_files, read_file theo từng đoạn và search_file khi cần; tiếp tục đọc bằng start_char cho đến cuối nếu câu hỏi yêu cầu bao quát toàn tài liệu. Phân biệt dữ kiện trong file với suy luận; trích tên mục/đoạn liên quan khi có thể. Nếu chưa đọc hết hoặc file không hỗ trợ, nói rõ giới hạn, tuyệt đối không giả vờ đã đọc toàn bộ.\n' +
    'Bạn có công cụ đọc/tạo/mã hóa/giải mã file và gửi file cho người dùng. ' +
    'Khi người dùng nhờ gửi hoặc tạo file: create_file rồi send_file. ' +
    'File người dùng đính kèm nằm sẵn trong app, truy cập bằng tên file. ' +
    'Khi người dùng nhờ nhớ điều gì, hoặc có thông tin lâu dài quan trọng về họ, gọi remember.\n\n' +
    'Bộ nhớ dài hạn:\n' + (memories.map((m) => '- ' + m.text).join('\n') || '(trống)');

  const messages = [
    { role: 'system', content: system },
    ...history.slice(-30).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent },
  ];
  const ctx = { sentFiles: [] };
  const base = String(settings.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('Chưa nhập Base URL trong Cài đặt.');
  if (!settings.apiKey) throw new Error('Chưa nhập API Key trong Cài đặt.');
  if (!settings.model) throw new Error('Chưa nhập tên Model trong Cài đặt.');
  const url = /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';

  for (let i = 0; i < 8; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
      body: JSON.stringify({ model: settings.model, messages, tools: TOOLS }),
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error(`API trả về dữ liệu không phải JSON (${res.status}): ${raw.slice(0, 240)}`); }
    if (!res.ok) throw new Error(`API ${res.status}: ${data.error?.message || data.message || raw.slice(0, 300)}`);
    const msg = data?.choices?.[0]?.message;
    if (!msg) throw new Error('API phản hồi không đúng định dạng chat/completions. Kiểm tra Base URL và Model.');
    messages.push(msg);
    if (!msg.tool_calls || !msg.tool_calls.length) {
      return { text: msg.content || '', sentFiles: ctx.sentFiles };
    }
    for (const tc of msg.tool_calls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
      onStatus && onStatus(`Đang dùng ${tc.function.name}${args.name ? ': ' + args.name : ''}…`);
      let result;
      try { result = await exec(tc.function.name, args, ctx); } catch (e) { result = 'Lỗi: ' + e.message; }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(result).slice(0, 60000) });
    }
  }
  return { text: '(Dừng vì gọi tool quá nhiều lần)', sentFiles: ctx.sentFiles };
}
