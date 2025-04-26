// ImageGeneratorScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Alert,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CameraRoll from '@react-native-community/cameraroll';
import RNFS from 'react-native-fs';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

const ASPECT_OPTIONS = [
  { label: 'Landscape 4:3', value: 'IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE' },
  { label: 'Landscape', value: 'IMAGE_ASPECT_RATIO_LANDSCAPE' },
  { label: 'Portrait 3:4', value: 'IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR' },
  { label: 'Portrait', value: 'IMAGE_ASPECT_RATIO_PORTRAIT' },
  { label: 'Square', value: 'IMAGE_ASPECT_RATIO_SQUARE' },
];

export default function ImageGeneratorScreen() {
  const navigation = useNavigation();
  const [prompts, setPrompts] = useState('');
  const [aspect, setAspect] = useState(ASPECT_OPTIONS[0].value);
  const [autoDownload, setAutoDownload] = useState(true);
  const [bearerToken, setBearerToken] = useState('');
  const [logs, setLogs] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const cancelRef = useRef(false);
  const scrollRef = useRef(null);
  const [expiresAtDisplay, setExpiresAtDisplay] = useState('');

  // direktori simpan
  const [saveDir, setSaveDir] = useState(RNFS.DocumentDirectoryPath);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [entries, setEntries] = useState([]);
  const [currentDir, setCurrentDir] = useState(saveDir);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [logs]);

  // baca token & expiry
  useEffect(() => {
    (async () => {
      // 1. Ambil username + token dari storage
      const username = await AsyncStorage.getItem('username');
      const token = await AsyncStorage.getItem('token');
      if (!token || !username) {
        return navigation.replace('Login');
      }

      // 2. Query Supabase untuk field expiresAt user ini
      const { data, error } = await supabase
        .from('users_imagen')
        .select('expiresAt')
        .eq('username', username)
        .single();

      if (error || !data) {
        // kalau gagal baca, anggap sesi invalid
        await AsyncStorage.multiRemove(['token', 'username', 'expiresAt']);
        return navigation.replace('Login');
      }

      // 3. Cek tanggal kadaluarsa
      const expiresAt = new Date(data.expiresAt);
      if (expiresAt < new Date()) {
        // sudah lewat → hapus storage & redirect ke Login
        await AsyncStorage.multiRemove(['token', 'username', 'expiresAt']);
        Alert.alert('Peringatan', `Langganan kamu sudah habis`);
        return navigation.replace('Login');
      }

      // 4. Kalau belum expired, simpan ke state untuk ditampilkan
      setExpiresAtDisplay(
        expiresAt.toLocaleDateString('id-ID', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      );
    })();
  }, [navigation]);

  const API_URL = "https://aisandbox-pa.googleapis.com/v1:runImageFx";

  // Android storage permission
  const ensurePermission = async () => {
    if (Platform.OS === 'android') {
      const r = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: 'Izin Simpan',
          message: 'Butuh izin simpan gambar',
          buttonPositive: 'OK'
        }
      );
      if (r !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Izin penyimpanan ditolak');
      }
    }
  };

  // Simpan gambar
  const saveImage = async (dataUrl, filename) => {
    await ensurePermission();
    const base64 = dataUrl.split(',')[1];

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      await CameraRoll.save(dataUrl, { type: 'photo', album: 'ImagenApp' });
      if (!autoDownload) {
        Alert.alert('Saved', 'Gambar berhasil disimpan ke gallery');
      }
    } else {
      const folder = saveDir;
      if (!(await RNFS.exists(folder))) {
        await RNFS.mkdir(folder);
      }
      const path = `${folder}/${filename}`;
      await RNFS.writeFile(path, base64, 'base64');
      if (!autoDownload) {
        Alert.alert('Saved', `Disimpan di:\n${path}`);
      }
    }
  };

  // Generate satu prompt
  const generateImagesForPrompt = async prompt => {
    const body = {
      userInput: { candidatesCount: 4, prompts: [prompt], seed: Date.now() % 1e6 },
      clientContext: { sessionId: `;${Date.now()}`, tool: 'IMAGE_FX' },
      modelInput: { modelNameType: 'IMAGEN_3_1' },
      aspectRatio: aspect,
    };
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        accept: '*/*',
        authorization: `Bearer ${bearerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Response bukan JSON valid');
    }
    if (!res.ok) {
      let msg = data.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) msg = 'Token invalid/kadaluarsa';
      else if (res.status === 429) msg = 'Rate limit exceeded';
      throw new Error(msg);
    }
    if (!data.imagePanels?.length) {
      throw new Error('No images dihasilkan.');
    }
    return data.imagePanels[0].generatedImages.map((img, i) => ({
      filename: `img_${Date.now()}_${i + 1}.jpg`,
      url: `data:image/jpeg;base64,${img.encodedImage}`,
    }));
  };

  // Loop generate + auto/manual save
  const generateForPrompts = async lines => {
    if (!lines.length) {
      setLogs([{ id: Date.now(), prompt: '', status: 'error', message: '⚠️ Prompt kosong' }]);
      return;
    }
    setIsGenerating(true);
    cancelRef.current = false;
    setLogs([]);

    for (let i = 0; i < lines.length; i++) {
      if (cancelRef.current) break;
      const prompt = lines[i];
      const id = Date.now() + i;
      setLogs(l => [...l, { id, prompt, status: 'pending' }]);

      try {
        const images = await generateImagesForPrompt(prompt);

        if (autoDownload) {
          for (const img of images) {
            try { await saveImage(img.url, img.filename); }
            catch (_) { }
          }
        }

        setLogs(l =>
          l.map(x =>
            x.id === id
              ? {
                ...x,
                status: 'success',
                images,
                message: autoDownload
                  ? '✅ Gambar disimpan otomatis'
                  : '✅ Selesai, gunakan tombol Download'
              }
              : x
          )
        );
      } catch (e) {
        setLogs(l =>
          l.map(x =>
            x.id === id
              ? { ...x, status: 'error', message: e.message }
              : x
          )
        );
      }
    }

    setIsGenerating(false);
  };

  // tombol Generate / Stop
  const onGenerate = () => {
    if (isGenerating) {
      cancelRef.current = true;
      setIsGenerating(false);
    } else {
      const lines = prompts.split('\n').map(s => s.trim()).filter(Boolean);
      generateForPrompts(lines);
    }
  };

  // Baca isi direktori untuk picker
  const readDir = async dir => {
    try {
      const list = await RNFS.readDir(dir);
      setEntries(list.filter(e => e.isDirectory()));
      setCurrentDir(dir);
    } catch {
      Alert.alert('Error', 'Gagal baca folder');
    }
  };
  useEffect(() => {
    if (pickerVisible) readDir(currentDir);
  }, [pickerVisible]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.header}>
          <Text style={styles.expiredText}>Expired: {expiresAtDisplay || '-'}</Text>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={async () => {
              await AsyncStorage.multiRemove(['token', 'expiresAt']);
              navigation.replace('Login');
            }}
          >
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.textarea}
          multiline
          value={prompts}
          onChangeText={setPrompts}
          editable={!isGenerating}
          placeholder="Prompt 1\nPrompt 2\nPrompt 3"
          placeholderTextColor="#666"
        />

        <View style={styles.aspectRow}>
          {ASPECT_OPTIONS.map(opt => {
            const active = opt.value === aspect;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setAspect(opt.value)}
                disabled={isGenerating}
                style={[
                  styles.aspectBtn,
                  active ? styles.aspectActive : styles.aspectInactive,
                ]}
              >
                <Text style={active ? styles.aspectTextActive : styles.aspectTextInactive}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Auto‐download</Text>
          <Switch
            value={autoDownload}
            onValueChange={setAutoDownload}
            disabled={isGenerating}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, isGenerating ? styles.btnStop : styles.btnGo]}
          onPress={onGenerate}
        >
          {isGenerating
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Generate</Text>}
        </TouchableOpacity>

        {/* Input Bearer Token */}
        <TextInput
          style={styles.tokenInput}
          placeholder="Masukkan Bearer Token"
          placeholderTextColor="#666"
          value={bearerToken}
          onChangeText={setBearerToken}
          editable={!isGenerating}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.folderRow}>
          <TouchableOpacity onPress={() => setPickerVisible(true)}>
            <Text style={styles.folderIcon}>📁</Text>
          </TouchableOpacity>
          <Text style={styles.folderPath} numberOfLines={1}>
            {saveDir}
          </Text>
        </View>
      </View>

      {/* Main */}
      <ScrollView
        ref={scrollRef}
        style={styles.main}
        contentContainerStyle={styles.logsContainer}
      >
        {logs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Hasil akan muncul di sini</Text>
          </View>
        ) : logs.map(log => (
          <View key={log.id} style={styles.logItem}>
            <View style={styles.logHeader}>
              <Text style={styles.promptText}>{log.prompt}</Text>
              {log.status === 'pending' && <ActivityIndicator size="small" color="#3D7BFF" />}
              {log.status === 'success' && (
                <Text style={styles.successText}>✅ {log.message}</Text>
              )}
              {log.status === 'error' && (
                <Text style={styles.errorText}>❌ {log.message}</Text>
              )}
            </View>
            {log.images && (
              <View style={styles.imagesRow}>
                {log.images.map((img, i) => (
                  <View key={i} style={styles.imageWrapper}>
                    <Image source={{ uri: img.url }} style={styles.image} />
                    <Text style={styles.imageName}>{img.filename}</Text>
                    {!autoDownload && (
                      <TouchableOpacity
                        style={styles.btnDownload}
                        onPress={() => saveImage(img.url, img.filename)}
                      >
                        <Text style={styles.downloadText}>Download</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {pickerVisible && (
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Pilih Folder</Text>
            <Text style={styles.modalPath}>{currentDir}</Text>
            <ScrollView style={styles.modalList}>
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => {
                  const parent = currentDir.replace(/\/[^\/]+$/, '');
                  readDir(parent);
                }}
              >
                <Text style={styles.modalItemText}>.. (Naik)</Text>
              </TouchableOpacity>
              {entries.map((e, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.modalItem}
                  onPress={() => readDir(e.path)}
                >
                  <Text style={styles.modalItemText}>{e.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.btnModalCancel}
                onPress={() => setPickerVisible(false)}
              >
                <Text style={styles.btnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnModalSelect}
                onPress={() => {
                  setSaveDir(currentDir);
                  setPickerVisible(false);
                }}
              >
                <Text style={styles.btnText}>Pilih</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#121419' },
  sidebar: { width: 280, padding: 12, backgroundColor: '#1C1E2B' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  expiredText: { color: '#A0AEC0' },
  logoutBtn: { backgroundColor: '#fff', padding: 6, borderRadius: 4 },
  logoutText: { color: '#000', fontWeight: 'bold' },

  textarea: {
    backgroundColor: 'rgba(46,48,66,0.25)',
    borderRadius: 8,
    padding: 8,
    color: '#fff',
    height: 200,
    textAlignVertical: 'top',
    marginBottom: 12
  },

  aspectRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  aspectBtn: { padding: 8, borderRadius: 6, margin: 4 },
  aspectActive: { backgroundColor: '#3A3C4D', borderWidth: 1, borderColor: '#fff' },
  aspectInactive: { backgroundColor: '#2E3042' },
  aspectTextActive: { color: '#fff' },
  aspectTextInactive: { color: '#A0AEC0' },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  switchLabel: { color: '#A0AEC0' },

  btn: { padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  btnGo: { backgroundColor: '#3D7BFF' },
  btnStop: { backgroundColor: '#E53E3E' },
  btnText: { color: '#fff', fontWeight: 'bold' },

  tokenInput: {
    backgroundColor: 'rgba(46,48,66,0.25)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: '#fff',
    marginBottom: 12,
    fontSize: 12
  },

  folderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  folderIcon: { fontSize: 20, marginRight: 8, color: '#fff' },
  folderPath: { color: '#A0AEC0', flex: 1, fontSize: 12 },

  main: { flex: 1, padding: 12 },
  logsContainer: { paddingBottom: 24 },
  empty: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#2E3042',
    borderRadius: 8, padding: 20
  },
  emptyText: { color: '#718096' },

  logItem: {
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 4, borderLeftColor: '#fff',
    borderRadius: 6, padding: 12
  },
  logHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  promptText: { flex: 1, color: '#fff', fontWeight: '600' },
  successText: { color: '#48BB78', marginLeft: 8 },
  errorText: { color: '#F56565', marginLeft: 8 },

  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  imageWrapper: { margin: 4, alignItems: 'center' },
  image: { width: 100, height: 100, borderRadius: 6 },
  imageName: { color: '#fff', fontSize: 10, marginTop: 4, marginBottom: 4 },

  btnDownload: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#3D7BFF', borderRadius: 4 },
  downloadText: { color: '#fff', fontSize: 12 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center'
  },
  modalBox: {
    width: '80%', maxHeight: '80%',
    backgroundColor: '#1C1E2B', borderRadius: 8, padding: 12
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  modalPath: { color: '#A0AEC0', fontSize: 12, marginBottom: 6 },
  modalList: { maxHeight: 200, marginBottom: 12 },
  modalItem: { padding: 8, borderBottomWidth: 1, borderBottomColor: '#2E3042' },
  modalItemText: { color: '#fff' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end' },
  btnModalCancel: { marginRight: 8, padding: 10, backgroundColor: '#2E3042', borderRadius: 6 },
  btnModalSelect: { padding: 10, backgroundColor: '#3D7BFF', borderRadius: 6 },
});
