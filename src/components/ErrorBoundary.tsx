import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { Text, Button } from '@rneui/themed';
import * as Updates from 'expo-updates';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '../utils/AsyncStorageWrapper';
import { colors } from '../utils/design';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log the error to an error reporting service
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    }

    handleRestart = async () => {
        try {
            await Updates.reloadAsync();
        } catch (e) {
            Alert.alert('Error', 'Could not reload automatically. Please restart the app manually.');
        }
    };

    handleClearCache = async () => {
        Alert.alert(
            'Clear Cache',
            'This will clear local data and log you out. This is a destructive action to fix persistent crashes. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear & Restart',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await AsyncStorage.clear();
                            this.handleRestart();
                        } catch (e) {
                            Alert.alert('Error', 'Failed to clear cache.');
                        }
                    },
                },
            ]
        );
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <View style={styles.content}>
                        <MaterialIcon name="error-outline" size={64} color={colors.accentRed || '#EF4444'} />
                        <Text style={styles.title}>Something went wrong</Text>
                        <Text style={styles.subtitle}>
                            The application encountered an unexpected error.
                        </Text>

                        <ScrollView style={styles.errorBox} contentContainerStyle={{ padding: 12 }}>
                            <Text style={styles.errorText}>
                                {this.state.error?.toString() || 'Unknown Error'}
                            </Text>
                        </ScrollView>

                        <Button
                            title="Restart App"
                            onPress={this.handleRestart}
                            buttonStyle={styles.restartBtn}
                            containerStyle={styles.btnContainer}
                            icon={<MaterialIcon name="refresh" size={20} color="white" style={{ marginRight: 8 }} />}
                        />

                        <Button
                            title="Clear Cache & Reset"
                            type="outline"
                            onPress={this.handleClearCache}
                            buttonStyle={styles.clearBtn}
                            titleStyle={{ color: colors.accentRed || '#EF4444' }}
                            containerStyle={styles.btnContainer}
                        />
                    </View>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        padding: 20,
    },
    content: {
        alignItems: 'center',
        width: '100%',
        maxWidth: 400,
        alignSelf: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text || '#1E293B',
        marginTop: 16,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: colors.muted || '#64748B',
        textAlign: 'center',
        marginBottom: 24,
    },
    errorBox: {
        backgroundColor: '#FEF2F2',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FECACA',
        width: '100%',
        maxHeight: 150,
        marginBottom: 32,
    },
    errorText: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 12,
        color: '#991B1B',
    },
    btnContainer: {
        width: '100%',
        marginBottom: 12,
    },
    restartBtn: {
        backgroundColor: colors.primary || '#2563EB',
        borderRadius: 12,
        paddingVertical: 12,
    },
    clearBtn: {
        borderColor: colors.accentRed || '#EF4444',
        borderRadius: 12,
        paddingVertical: 12,
    },
});

export default ErrorBoundary;
