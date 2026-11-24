import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const K = { conv: 'conversations_v1', mem: 'memories_v1', set: 'settings_v1' };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

// Cài đặt: API key lưu trong SecureStore (Keychain/Keystore), phần còn lại AsyncStorage
export async function loadSettings() {
  const s = parse(await AsyncStorage.getItem(K.set), null) || {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  };
  s.apiKey = (await SecureStore.getItemAsync('apiKey')) || '';
  return s;
}
export async function saveSettings(s) {
  const { apiKey, ...rest } = s;
  await AsyncStorage.setItem(K.set, JSON.stringify(rest));
  if (apiKey) {
    // Không âm thầm bỏ qua lỗi: nếu Keychain/Keystore không lưu được, báo rõ cho người dùng.
    await SecureStore.setItemAsync('apiKey', apiKey);
  } else {
    await SecureStore.deleteItemAsync('apiKey').catch(() => {});
  }
}

// Lịch sử trò chuyện (lưu trong máy, không cần đăng nhập)
export const loadConversations = async () => parse(await AsyncStorage.getItem(K.conv), []);
export const saveConversations = (c) => AsyncStorage.setItem(K.conv, JSON.stringify(c));

// Bộ nhớ dài hạn: danh sách "sự thật" AI tự ghi nhớ qua tool remember
export const loadMemories = async () => parse(await AsyncStorage.getItem(K.mem), []);
export const saveMemories = (m) => AsyncStorage.setItem(K.mem, JSON.stringify(m));
