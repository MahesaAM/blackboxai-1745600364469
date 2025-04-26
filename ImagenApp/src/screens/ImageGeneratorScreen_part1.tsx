import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Image,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

const ASPECT_OPTIONS = [
    { label: 'Landscape 4:3', value: 'IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE' },
    { label: 'Landscape', value: 'IMAGE_ASPECT_RATIO_LANDSCAPE' },
    { label: 'Portrait 3:4', value: 'IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR' },
    { label: 'Portrait', value: 'IMAGE_ASPECT_RATIO_PORTRAIT' },
    { label: 'Square', value: 'IMAGE_ASPECT_RATIO_SQUARE' },
];

type LogEntry = {
    id: number;
    prompt: string;
    status: 'pending' | 'success' | 'error';
    message?: string;
    images?: Array<{ url: string; filename: string }>;
};

const ImageGeneratorScreen = () => {
    const navigation = useNavigation();
    const [prompts, setPrompts] = useState('');
    const [aspect, setAspect] = useState(ASPECT_OPTIONS[0].value);
    const [autoDownload, setAutoDownload] = useState(true);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const cancelRef = useRef(false);

    const [expiresAtDisplay, setExpiresAtDisplay] = useState('');

    useEffect(() => {
        const checkAuth = async () => {
            const token = await AsyncStorage.getItem('token');
            const expiresAt = await AsyncStorage.getItem('expiresAt');

            if (!token) {
                navigation.navigate('Login' as never);
            } else if (token === 'admin-token') {
                navigation.navigate('Admin' as never);
            } else if (expiresAt && new Date(expiresAt) < new Date()) {
                await AsyncStorage.removeItem('token');
                await AsyncStorage.removeItem('expiresAt');
                navigation.navigate('Login' as never);
            } else if (expiresAt) {
                try {
                    const date = new Date(expiresAt);
                    setExpiresAtDisplay(date.toLocaleDateString('id-ID', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    }));
                } catch {
                    setExpiresAtDisplay(expiresAt);
                }
            }
        };
        checkAuth();
    }, [navigation]);

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
                // Replace with your image generation API call
                // Here we simulate a delay and success response
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Simulated image data
                const images = [
                    {
                        url: 'https://via.placeholder.com/150',
                        filename: 'image1.png',
                    },
                ];

                setLogs((l) =>
                    l.map((x) =>
                        x.id === logId ? { ...x, status: 'success', images } : x
                    )
                );

                if (autoDownload) {
                    // React Native does not support automatic download like web
                    // You can implement saving images to gallery using libraries if needed
                    Alert.alert('Auto-download', 'Image auto-download is not supported on React Native.');
                }
            } catch (err: any) {
                setLogs((l) =>
                    l.map((x) =>
                        x.id === logId
                            ? { ...x, status: 'error', message: err.message || 'Unknown error' }
                            : x
                    )
                );
            }
        }

        setIsGenerating(false);
    };

    const handleGenerate = async () => {
        if (isGenerating) {
            cancelRef.current = true;
            setIsGenerating(false);
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
