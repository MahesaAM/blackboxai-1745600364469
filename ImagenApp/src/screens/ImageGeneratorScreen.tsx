import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackNavigationProp } from '@react-navigation/stack';
import * as FileSystem from 'react-native-fs';
import { RootStackParamList } from '../../App';

const ASPECT_OPTIONS = [
  { label: "Landscape 4:3", value: "IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE" },
  { label: "Landscape", value: "IMAGE_ASPECT_RATIO_LANDSCAPE" },
  { label: "Portrait 3:4", value: "IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR" },
  { label: "Portrait", value: "IMAGE_ASPECT_RATIO_PORTRAIT" },
  { label: "Square", value: "IMAGE_ASPECT_RATIO_SQUARE" },
];

type ImageGeneratorScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'ImageGenerator'>;
};

type LogEntry = {
  id: number;
  prompt: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
  images?: Array<{ url: string; filename: string }>;
};

const ImageGeneratorScreen: React.FC<ImageGeneratorScreenProps> = ({ navigation }) => {
  const [prompts, setPrompts] = useState('');
  const [aspect, setAspect] = useState(ASPECT_OPTIONS[0].value);
  const [autoDownload, setAutoDownload] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expiresAtDisplay, setExpiresAtDisplay] = useState('');
  const cancelRef = useRef(false);
  const bottomRef = useRef<ScrollView>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollToEnd({ animated: true });
  }, [logs]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = await AsyncStorage.getItem('token');
      const expiresAt = await AsyncStorage.getItem('expiresAt');

      if (!token) {
        navigation.replace('Login');
      } else if (token === 'admin-token') {
        navigation.replace('Admin');
      } else if (expiresAt && new Date(expiresAt) < new Date()) {
        await AsyncStorage.multiRemove(['token', 'expiresAt']);
        navigation.replace('Login');
      } else if (expiresAt) {
        try {
          const date = new Date(expiresAt);
          setExpiresAtDisplay(
            date.toLocaleDateString('id-ID', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          );
        } catch {
          setExpiresAtDisplay(expiresAt);
        }
      }
    };
    checkAuth();
  }, []);

  const generateForPrompts = async (lines: string[]) => {
    if (lines.length === 0) {
      setLogs((l) => [
        ...l,
        {
          id: Date.now(),
          prompt: '',
          status: 'error',
          message: '⚠️ Prompt belum diisi.',
        },
      ]);
      return;
    }

    setIsGenerating(true);
    cancelRef.current = false;

    for (let i = 0; i < lines.length; i++) {
      if (cancelRef.current) break;
      const prompt = lines[i];
      const logId = Date.now() + i;

      setLogs((l) => [...l, { id: logId, prompt, status: 'pending' }]);

      try {
        const controller = new AbortController();
        setAbortController(controller);

        const token = await AsyncStorage.getItem('token');

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ prompt, aspectRatio: aspect }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let errorMessage = 'Failed to generate';
          try {
            const errorData = await res.json();
            if (errorData.error) {
              errorMessage = errorData.error;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(errorMessage);
        }

        const data = await res.json();

        setLogs((l) =>
          l.map((x) =>
            x.id === logId ? { ...x, status: 'success', images: data.images } : x
          )
        );

        if (autoDownload && Platform.OS !== 'web') {
          data.images.forEach((img: any, idx: number) =>
            setTimeout(async () => {
              try {
                const path = `${FileSystem.DocumentDirectoryPath}/${img.filename}`;
                await FileSystem.downloadFile({
                  fromUrl: img.url,
                  toFile: path,
                }).promise;
              } catch (err) {
                console.error('Download error:', err);
              }
            }, idx * 1200)
          );
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setLogs((l) =>
            l.map((x) =>
              x.id === logId
                ? {
                    ...x,
                    status: 'error',
                    message: ' Dibatalkan oleh pengguna.',
                  }
                : x
            )
          );
        } else {
          setLogs((l) =>
            l.map((x) =>
              x.id === logId
                ? {
                    ...x,
                    status: 'error',
                    message: err.message || 'Unknown error',
                  }
                : x
            )
          );
        }
      }
    }

    setIsGenerating(false);
    setAbortController(null);
  };

  const handleGenerate = async () => {
    if (isGenerating) {
      cancelRef.current = true;
      abortController?.abort();
      setIsGenerating(false);
      setAbortController(null);
      return;
    }

    const lines = prompts
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    setLogs([]);
    await generateForPrompts(lines);
    setLogs((l) => [
      ...l,
      {
        id: Date.now() + 9999,
        prompt: '',
        status: 'success',
        message: '✅ Semua prompt selesai diproses.',
      },
    ]);
  };

  const retryPrompt = async (prompt: string) => {
    setLogs((l) => l.filter((x) => !(x.prompt === prompt && x.status === 'error')));
    await generateForPrompts([prompt]);
  };

  const retryAllFailed = async () => {
    const failed = logs.filter((x) => x.status === 'error').map((x) => x.prompt);
    if (!failed.length) return;
    setLogs((l) => l.filter((x) => x.status !== 'error'));
    await generateForPrompts(failed);
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['token', 'expiresAt']);
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.sidebar}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.expiryButton}>
            <Text style={styles.expiryText}>Expired: {expiresAtDisplay || '-'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controls}>
          <Text style={styles.label}>Describe the image you want to generate</Text>
          <TextInput
            style={styles.promptInput}
            multiline
            value={prompts}
            onChangeText={setPrompts}
            placeholder="Prompt 1\nPrompt 2\nPrompt 3"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>Aspect ratio</Text>
          <View style={styles.aspectContainer}>
            <Picker
              selectedValue={aspect}
              onValueChange={setAspect}
              style={styles.aspectPicker}
            >
              {ASPECT_OPTIONS.map(option => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  color="#fff"
                />
              ))}
            </Picker>
          </View>

          <TouchableOpacity
            style={[
              styles.generateButton,
              (isGenerating || !prompts.trim()) && styles.generateButtonDisabled,
            ]}
            onPress={handleGenerate}
            disabled={!prompts.trim()}
          >
            {isGenerating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>Generate</Text>
            )}
          </TouchableOpacity>

          {Platform.OS !== 'web' && (
            <View style={styles.autoDownloadContainer}>
              <Text style={styles.label}>Auto-download</Text>
              <TouchableOpacity
                style={[styles.switch, autoDownload && styles.switchActive]}
                onPress={() => setAutoDownload(!autoDownload)}
              >
                <View style={[styles.switchThumb, autoDownload && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {logs.some((x) => x.status === 'error') && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={retryAllFailed}
            disabled={isGenerating}
          >
            <Text style={styles.retryButtonText}>Retry All Failed</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        style={styles.mainContent} 
        ref={bottomRef}
        contentContainerStyle={logs.length === 0 ? styles.emptyStateContainer : undefined}
      >
        {logs.length === 0 ? (
          <View style={styles.emptyState}>
            <Image
              source={{ uri: 'https://sf16-web-tos-buz.capcutstatic.com/obj/capcut-web-buz-sg/ies/lvweb/mweb_online_new_frame/static/image/mweb-story-guide-bg-image.ff08b4ac.png' }}
              style={styles.emptyStateImage}
              resizeMode="contain"
            />
            <Text style={styles.emptyStateText}>Generated results will appear here</Text>
          </View>
        ) : (
          <View style={styles.logList}>
            {logs.map((log) => (
              <View key={log.id} style={styles.logEntry}>
                {log.prompt ? (
                  <>
                    <View style={styles.logHeader}>
                      <Text style={styles.promptText}>Prompt: {log.prompt}</Text>
                      {log.status === 'pending' && <ActivityIndicator />}
                      {log.status === 'success' && log.images && (
                        <Text style={styles.successText}>
                          ✅ Berhasil. {log.images.length} gambar.
                        </Text>
                      )}
                      {log.status === 'error' && (
                        <Text style={styles.errorText}>❌ {log.message}</Text>
                      )}
                      {log.status === 'error' && (
                        <TouchableOpacity
                          style={styles.retryPromptButton}
                          onPress={() => retryPrompt(log.prompt)}
                        >
                          <Text style={styles.retryPromptButtonText}>Retry</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {log.images && (
                      <ScrollView horizontal style={styles.imagesContainer}>
                        {log.images.map((img, idx) => (
                          <View key={idx} style={styles.imageWrapper}>
                            <Image 
                              source={{ uri: img.url }} 
                              style={styles.generatedImage}
                              resizeMode="cover"
                            />
                            {Platform.OS !== 'web' && (
                              <TouchableOpacity
                                style={styles.downloadButton}
                                onPress={async () => {
                                  try {
                                    const path = `${FileSystem.DocumentDirectoryPath}/${img.filename}`;
                                    await FileSystem.downloadFile({
                                      fromUrl: img.url,
                                      toFile: path,
                                    }).promise;
                                  } catch (err) {
                                    console.error('Download error:', err);
                                  }
                                }}
                              >
                                <Text style={styles.downloadButtonText}>Download</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </>
                ) : (
                  <Text style={styles.messageText}>{log.message}</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    backgroundColor: '#18191F',
  },
  sidebar: {
    width: Platform.OS === 'web' ? 300 : '100%',
    backgroundColor: '#1C1E2B',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  expiryButton: {
    backgroundColor: '#2E3042',
    padding: 8,
    borderRadius: 20,
  },
  expiryText: {
    color: '#fff',
    fontSize: 12,
  },
  logoutButton: {
    backgroundColor: '#ff4444',
    padding: 8,
    borderRadius: 20,
  },
  logoutText: {
    color: '#fff',
    fontSize: 12,
  },
  controls: {
    flex: Platform.OS === 'web' ? 1 : undefined,
  },
  label: {
    color: '#999',
    marginBottom: 8,
    fontSize: 14,
  },
  promptInput: {
    backgroundColor: 'rgba(46, 48, 66, 0.4)',
    borderWidth: 1,
    borderColor: '#3A3C4D',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    height: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  aspectContainer: {
    backgroundColor: '#2E3042',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  aspectPicker: {
    color: '#fff',
  },
  generateButton: {
    backgroundColor: '#3D7BFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    backgroundColor: '#3A3C4D',
    opacity: 0.5,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  autoDownloadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  switch: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3A3C4D',
    padding: 2,
  },
  switchActive: {
    backgroundColor: '#3D7BFF',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  switchThumbActive: {
    transform: [{ translateX: 16 }],
  },
  mainContent: {
    flex: 1,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#2E3042',
    borderRadius: 8,
    padding: 20,
    margin: 16,
  },
  emptyStateImage: {
    width: 200,
    height: 200,
    marginBottom: 16,
  },
  emptyStateText: {
    color: '#666',
  },
  logList: {
    padding: 16,
    gap: 16,
  },
  logEntry: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderLeftWidth: 4,
    borderLeftColor: '#fff',
    padding: 16,
    borderRadius: 8,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promptText: {
    color: '#fff',
    flex: 1,
  },
  successText: {
    color: '#4CAF50',
  },
  errorText: {
    color: '#ff4444',
  },
  messageText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  imagesContainer: {
    marginTop: 12,
  },
  imageWrapper: {
    marginRight: 12,
    alignItems: 'center',
  },
  generatedImage: {
    width: 180,
    height: 180,
    borderRadius: 8,
    marginBottom: 8,
  },
  downloadButton: {
    backgroundColor: '#FFB300',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  downloadButtonText: {
    color: '#000',
    fontSize: 12,
  },
  retryButton: {
    backgroundColor: '#673AB7',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  retryPromptButton: {
    backgroundColor: '#3D7BFF',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  retryPromptButtonText: {
    color: '#fff',
    fontSize: 12,
  },
});

export default ImageGeneratorScreen;
