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
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('expiresAt');
    navigation.navigate('Login' as never);
};

return (
    <View style={styles.container}>
        <View style={styles.sidebar}>
            <View style={styles.expiredContainer}>
                <TouchableOpacity style={styles.expiredButton}>
                    <Text style={styles.expiredButtonText}>Expired</Text>
                    <Text style={styles.expiredDate}>{expiresAtDisplay || '-'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton} accessibilityLabel="Logout">
                    <Text style={styles.logoutButtonText}>Logout</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
                <Text style={styles.label}>Describe the image you want to generate</Text>
                <TextInput
                    style={styles.textarea}
                    multiline
                    numberOfLines={4}
                    value={prompts}
                    onChangeText={setPrompts}
                    editable={!isGenerating}
                    placeholder="Prompt 1{'\n'}Prompt 2{'\n'}Prompt 3"
                    placeholderTextColor="#999"
                />
                <Text style={styles.charCount}>{prompts.length}</Text>
            </View>

            <View style={styles.aspectContainer}>
                <Text style={styles.label}>Aspect ratio</Text>
                <View style={styles.aspectOptions}>
                    {ASPECT_OPTIONS.map(({ label, value }) => {
                        const active = aspect === value;
                        return (
                            <TouchableOpacity
                                key={value}
                                onPress={() => setAspect(value)}
                                disabled={isGenerating}
                                style={[styles.aspectButton, active ? styles.aspectButtonActive : styles.aspectButtonInactive]}
                            >
                                <Text style={active ? styles.aspectButtonTextActive : styles.aspectButtonTextInactive}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <TouchableOpacity
                onPress={handleGenerate}
                disabled={isGenerating || !prompts.trim()}
                style={[styles.generateButton, (isGenerating || !prompts.trim()) ? styles.generateButtonDisabled : styles.generateButtonEnabled]}
            >
                {isGenerating ? <ActivityIndicator color="#fff" /> : <Text style={styles.generateButtonText}>Generate</Text>}
            </TouchableOpacity>

            {logs.some((x) => x.status === 'error') && (
                <TouchableOpacity
                    onPress={retryAllFailed}
                    disabled={isGenerating}
                    style={styles.retryButton}
                >
                    <Text style={styles.retryButtonText}>Retry All Failed</Text>
                </TouchableOpacity>
            )}
        </View>

        <ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
            {logs.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>Generated results will appear here</Text>
                </View>
            ) : (
                logs.map((log) => (
                    <View key={log.id} style={styles.logItem}>
                        {log.prompt ? (
                            <>
                                <View style={styles.logHeader}>
                                    <Text style={styles.logPrompt}>{log.prompt}</Text>
                                    {log.status === 'pending' && <ActivityIndicator size="small" color="#3D7BFF" />}
                                    {log.status === 'success' && log.images && (
                                        <Text style={styles.logSuccess}>✅ Berhasil. {log.images.length} gambar.</Text>
                                    )}
                                    {log.status === 'error' && (
                                        <>
                                            <Text style={styles.logError}>❌ {log.message}</Text>
                                            <TouchableOpacity onPress={() => retryPrompt(log.prompt)} style={styles.retryPromptButton}>
                                                <Text style={styles.retryPromptButtonText}>Retry</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                                {log.images && (
                                    <View style={styles.imagesContainer}>
                                        {log.images.map((img, idx) => (
                                            <TouchableOpacity key={idx} onPress={() => { /* Implement image download or preview */ }}>
                                                <Image source={{ uri: img.url }} style={styles.image} />
                                                <Text style={styles.imageFilename}>{img.filename}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </>
                        ) : (
                            <Text style={styles.logMessage}>{log.message}</Text>
                        )}
                    </View>
                ))
            )}
        </ScrollView>
    </View>
);
};

const styles = StyleSheet.create({
    container: { flex: 1, flexDirection: 'row', backgroundColor: '#121419' },
    sidebar: {
        width: 280,
        backgroundColor: '#1C1E2B',
        padding: 16,
    },
    expiredContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    expiredButton: {
        flexDirection: 'row',
        backgroundColor: '#2E3042',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        alignItems: 'center',
    },
    expiredButtonText: {
        color: '#A0AEC0',
        fontSize: 14,
        marginRight: 8,
    },
    expiredDate: {
        color: '#718096',
        fontSize: 14,
    },
    logoutButton: {
        backgroundColor: '#fff',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoutButtonText: {
        color: '#000',
        fontWeight: 'bold',
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        color: '#A0AEC0',
        fontSize: 14,
        marginBottom: 4,
    },
    textarea: {
        backgroundColor: 'rgba(46, 48, 66, 0.25)',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        fontSize: 16,
        height: 100,
        textAlignVertical: 'top',
    },
    charCount: {
        color: '#718096',
        fontSize: 12,
        textAlign: 'right',
        marginTop: 4,
    },
    aspectContainer: {
        marginBottom: 16,
    },
    aspectOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    aspectButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginRight: 8,
        marginBottom: 8,
    },
    aspectButtonActive: {
        backgroundColor: '#3A3C4D',
        borderWidth: 2,
        borderColor: '#fff',
    },
    aspectButtonInactive: {
        backgroundColor: '#2E3042',
    },
    aspectButtonTextActive: {
        color: '#fff',
    },
    aspectButtonTextInactive: {
        color: '#A0AEC0',
    },
    generateButton: {
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    generateButtonEnabled: {
        backgroundColor: '#3D7BFF',
    },
    generateButtonDisabled: {
        backgroundColor: '#3A3C4D',
    },
    generateButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    retryButton: {
        marginTop: 12,
        paddingVertical: 10,
        backgroundColor: '#6B46C1',
        borderRadius: 8,
        alignItems: 'center',
    },
    retryButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    main: {
        flex: 1,
        padding: 16,
    },
    mainContent: {
        paddingBottom: 16,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyStateText: {
        color: '#718096',
        fontSize: 16,
    },
    logItem: {
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        borderLeftWidth: 4,
        borderLeftColor: '#fff',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
    },
    logHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    logPrompt: {
        flex: 1,
        color: '#fff',
        fontWeight: 'bold',
    },
    logSuccess: {
        marginLeft: 8,
        color: '#48BB78',
    },
    logError: {
        marginLeft: 8,
        color: '#F56565',
    },
    retryPromptButton: {
        marginLeft: 8,
        backgroundColor: '#3182CE',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    retryPromptButtonText: {
        color: '#fff',
    },
    imagesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    image: {
        width: 180,
        height: 180,
        borderRadius: 8,
    },
    imageFilename: {
        color: '#A0AEC0',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 4,
    },
});

export default ImageGeneratorScreen;
