import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, Modal, StyleSheet, SafeAreaView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView, StatusBar,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {
  loadSettings, saveSettings, loadConversations, saveConversations, loadMemories, saveMemories,
} from './src/storage';
import { saveAttachment, readFileForAI, filePath } from './src/files';
import { runChat, testConnection } from './src/api';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const newConv = () => ({ id: uid(), title: 'Cuộc trò chuyện mới', messages: [], at: Date.now() });

export default function App() {
  const [settings, setSettings] = useState({ baseUrl: '', apiKey: '', model: '' });
  const [convs, setConvs] = useState([]);
  const [curId, setCurId] = useState(null);
  const [memories, setMemories] = useState([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [showList, setShowList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      setMemories(await loadMemories());
      let c = await loadConversations();
      if (!c.length) c = [newConv()];
      setConvs(c);
      setCurId(c[0].id);
      if (!s.apiKey) setShowSettings(true);
    })();
  }, []);

  const cur = convs.find((c) => c.id === curId);
  const persist = (next) => { setConvs(next); saveConversations(next); };

  const pickFiles = async () => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
    if (r.canceled) return;
    const names = [];
    for (const a of r.assets) names.push(await saveAttachment(a.uri, a.name));
    setPending((p) => [...p, ...names]);
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pending.length) || busy || !cur) return;
    if (!settings.apiKey) { setShowSettings(true); return; }
    setBusy(true); setStatus('');
    const attached = pending;
    setInput(''); setPending([]);

    // Ghép nội dung file đính kèm vào tin nhắn
    let body = text;
    const images = [];
    for (const n of attached) {
      try {
        const r = await readFileForAI(n);
        if (r.type === 'image') images.push(r.dataUrl);
        else body += `\n\n[File đính kèm: ${n}]\n${r.text}`;
      } catch (e) {
        body += `\n\n[File đính kèm: ${n}] (không đọc được: ${e.message})`;
      }
    }
    const userContent = images.length
      ? [{ type: 'text', text: body || 'Xem ảnh này' }, ...images.map((u) => ({ type: 'image_url', image_url: { url: u } }))]
      : body;

    // Lưu tin nhắn người dùng (chỉ lưu tên file, không lưu nội dung/ảnh để nhẹ)
    const stored = text + (attached.length ? `\n\n📎 ${attached.join(', ')}` : '');
    const userMsg = { id: uid(), role: 'user', content: stored, files: [] };
    const history = cur.messages;
    let next = convs.map((c) => c.id === curId
      ? { ...c, messages: [...c.messages, userMsg], title: c.messages.length ? c.title : (text || attached[0]).slice(0, 30), at: Date.now() }
      : c);
    persist(next);

    try {
      const mem = await loadMemories();
      const res = await runChat({ settings, history, memories: mem, userContent, onStatus: setStatus });
      setMemories(await loadMemories());
      const botMsg = { id: uid(), role: 'assistant', content: res.text, files: res.sentFiles };
      next = next.map((c) => c.id === curId ? { ...c, messages: [...c.messages, botMsg] } : c);
    } catch (e) {
      const err = { id: uid(), role: 'assistant', content: '⚠️ ' + e.message, files: [] };
      next = next.map((c) => c.id === curId ? { ...c, messages: [...c.messages, err] } : c);
    }
    persist(next);
    setBusy(false); setStatus('');
    setTimeout(() => listRef.current && listRef.current.scrollToEnd({ animated: true }), 100);
  };

  const share = async (name) => {
    try {
      if (!(await Sharing.isAvailableAsync())) return Alert.alert('Thiết bị không hỗ trợ chia sẻ file');
      await Sharing.shareAsync(filePath(name));
    } catch (e) { Alert.alert('Lỗi', e.message); }
  };

  const delConv = (id) => {
    let next = convs.filter((c) => c.id !== id);
    if (!next.length) next = [newConv()];
    persist(next);
    if (id === curId) setCurId(next[0].id);
  };

  const render = ({ item }) => (
    <View style={[s.bubble, item.role === 'user' ? s.user : s.bot]}>
      <Text style={item.role === 'user' ? s.userTxt : s.botTxt} selectable>{item.content}</Text>
      {(item.files || []).map((f) => (
        <TouchableOpacity key={f} style={s.fileCard} onPress={() => share(f)}>
          <Text style={s.fileTxt}>📄 {f}  ·  Mở / Lưu</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => setShowList(true)}><Text style={s.hBtn}>☰</Text></TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{cur ? cur.title : ''}</Text>
        <TouchableOpacity onPress={() => setShowSettings(true)}><Text style={s.hBtn}>⚙︎</Text></TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={cur ? cur.messages : []}
          keyExtractor={(m) => m.id}
          renderItem={render}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => listRef.current && listRef.current.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={s.empty}>Hãy nhắn gì đó, hoặc đính kèm file 📎</Text>}
        />
        {busy && (
          <View style={s.statusRow}><ActivityIndicator /><Text style={s.statusTxt}>  {status || 'Đang trả lời…'}</Text></View>
        )}
        {!!pending.length && (
          <ScrollView horizontal style={s.pendingRow}>
            {pending.map((n) => (
              <TouchableOpacity key={n} style={s.chip} onPress={() => setPending(pending.filter((x) => x !== n))}>
                <Text>📎 {n} ✕</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <View style={s.inputRow}>
          <TouchableOpacity onPress={pickFiles} style={s.iconBtn}><Text style={{ fontSize: 22 }}>📎</Text></TouchableOpacity>
          <TextInput style={s.input} value={input} onChangeText={setInput} placeholder="Nhắn tin…" multiline />
          <TouchableOpacity onPress={send} disabled={busy} style={[s.sendBtn, busy && { opacity: 0.4 }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Gửi</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Danh sách cuộc trò chuyện */}
      <Modal visible={showList} animationType="slide" onRequestClose={() => setShowList(false)}>
        <SafeAreaView style={s.root}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setShowList(false)}><Text style={s.hBtn}>✕</Text></TouchableOpacity>
            <Text style={s.title}>Lịch sử</Text>
            <TouchableOpacity onPress={() => { const c = newConv(); persist([c, ...convs]); setCurId(c.id); setShowList(false); }}>
              <Text style={s.hBtn}>＋</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={[...convs].sort((a, b) => b.at - a.at)}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <View style={s.convRow}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => { setCurId(item.id); setShowList(false); }}>
                  <Text style={[s.convTitle, item.id === curId && { fontWeight: '700' }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.convSub}>{new Date(item.at).toLocaleString()}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert('Xóa cuộc trò chuyện?', '', [
                  { text: 'Hủy' }, { text: 'Xóa', style: 'destructive', onPress: () => delConv(item.id) }])}>
                  <Text style={{ fontSize: 18 }}>🗑</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Cài đặt + bộ nhớ */}
      <Modal visible={showSettings} animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <SafeAreaView style={s.root}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setShowSettings(false)}><Text style={s.hBtn}>✕</Text></TouchableOpacity>
            <Text style={s.title}>Cài đặt</Text>
            <TouchableOpacity onPress={async () => {
              try { await saveSettings(settings); setShowSettings(false); }
              catch (e) { Alert.alert('Không lưu được cài đặt', e.message); }
            }}>
              <Text style={s.hBtn}>Lưu</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>Base URL (tương thích OpenAI)</Text>
            <TextInput style={s.field} value={settings.baseUrl} onChangeText={(v) => setSettings({ ...settings, baseUrl: v })} autoCapitalize="none" />
            <Text style={s.label}>API key</Text>
            <TextInput style={s.field} value={settings.apiKey} onChangeText={(v) => setSettings({ ...settings, apiKey: v })} autoCapitalize="none" secureTextEntry />
            <Text style={s.label}>Model</Text>
            <TextInput style={s.field} value={settings.model} onChangeText={(v) => setSettings({ ...settings, model: v })} autoCapitalize="none" />
            <TouchableOpacity
              style={[s.testBtn, testingApi && { opacity: 0.55 }]}
              disabled={testingApi}
              onPress={async () => {
                setTestingApi(true);
                try {
                  const result = await testConnection(settings);
                  Alert.alert('Kết nối thành công', String(result).slice(0, 300));
                } catch (e) { Alert.alert('Kết nối thất bại', e.message); }
                finally { setTestingApi(false); }
              }}
            >
              <Text style={s.testBtnText}>{testingApi ? 'Đang kiểm tra…' : 'Kiểm tra kết nối API'}</Text>
            </TouchableOpacity>
            <Text style={[s.label, { marginTop: 24 }]}>Bộ nhớ dài hạn ({memories.length})</Text>
            {memories.map((m) => (
              <View key={m.id} style={s.convRow}>
                <Text style={{ flex: 1 }}>{m.text}</Text>
                <TouchableOpacity onPress={async () => { const n = memories.filter((x) => x.id !== m.id); setMemories(n); await saveMemories(n); }}>
                  <Text style={{ fontSize: 18 }}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))}
            {!memories.length && <Text style={s.convSub}>AI sẽ tự ghi nhớ khi bạn nhờ “nhớ giúp tôi…”.</Text>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  hBtn: { fontSize: 20, paddingHorizontal: 8 },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  bubble: { maxWidth: '85%', padding: 10, borderRadius: 14, marginBottom: 8 },
  user: { alignSelf: 'flex-end', backgroundColor: '#2563eb' },
  bot: { alignSelf: 'flex-start', backgroundColor: '#f1f1f1' },
  userTxt: { color: '#fff' },
  botTxt: { color: '#111' },
  fileCard: { marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  fileTxt: { color: '#2563eb' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  statusRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 },
  statusTxt: { color: '#666' },
  pendingRow: { maxHeight: 44, paddingHorizontal: 8 },
  chip: { backgroundColor: '#eef', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6, alignSelf: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  iconBtn: { padding: 8 },
  input: { flex: 1, maxHeight: 120, borderWidth: 1, borderColor: '#ccc', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  sendBtn: { backgroundColor: '#2563eb', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, marginLeft: 6 },
  convRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  convTitle: { fontSize: 15 },
  convSub: { fontSize: 12, color: '#888', marginTop: 2 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 4 },
  field: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  testBtn: { marginTop: 14, padding: 12, borderRadius: 9, backgroundColor: '#e8efff', alignItems: 'center' },
  testBtnText: { color: '#1d4ed8', fontWeight: '700' },
});
