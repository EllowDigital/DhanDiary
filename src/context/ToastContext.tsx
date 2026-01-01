import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- Types ---
type ToastType = 'success' | 'error' | 'info';

interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  actionLabel?: string;
  onAction?: (() => void) | null;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showActionToast: (
    message: string,
    actionLabel: string,
    onAction: () => void,
    type?: ToastType,
    duration?: number
  ) => void;
  hideToast: () => void;
}

// --- Context ---
const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  showActionToast: () => {},
  hideToast: () => {},
});

export const useToast = () => useContext(ToastContext);

// --- Configuration ---
const TOAST_THEME = {
  success: {
    bg: '#064E3B', // Dark Green
    text: '#ECFDF5', // Light Green Text
    iconColor: '#34D399',
    icon: 'check-circle' as const,
  },
  error: {
    bg: '#7F1D1D', // Dark Red
    text: '#FEF2F2',
    iconColor: '#F87171',
    icon: 'alert-circle' as const,
  },
  info: {
    bg: '#1E3A8A', // Dark Blue
    text: '#EFF6FF',
    iconColor: '#60A5FA',
    icon: 'information' as const,
  },
};

// --- Component ---
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // Suppress Neon/internal DB messages from being shown to end-users in production
    try {
      const lower = String(message || '').toLowerCase();
      if (!(typeof __DEV__ !== 'undefined' && __DEV__)) {
        if (lower.includes('neon') || lower.includes('neondb') || lower.includes('neondberror')) {
          return; // don't surface implementation details to users
        }
      }
    } catch (e) {}

    setToast({ message, type, duration, actionLabel: undefined, onAction: null });

    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, duration);
  }, []);

  const showActionToast = useCallback(
    (
      message: string,
      actionLabel: string,
      onAction: () => void,
      type: ToastType = 'info',
      duration = 6000
    ) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      setToast({ message, type, duration, actionLabel, onAction });

      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, duration);
    },
    []
  );

  const contextValue = useMemo(
    () => ({ showToast, showActionToast, hideToast }),
    [showToast, showActionToast, hideToast]
  );

  const config = toast ? TOAST_THEME[toast.type || 'info'] : TOAST_THEME.info;

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {toast && (
        <Animated.View
          entering={FadeInUp.springify().damping(16).mass(0.8).stiffness(150)}
          exiting={FadeOutUp.duration(200)}
          layout={Layout.springify()}
          style={[
            styles.container,
            { top: insets.top + (Platform.OS === 'android' ? 10 : 0) }, // Adjust for status bar
          ]}
          pointerEvents="box-none" // Allow touches to pass through the container area
        >
          <View style={[styles.card, { backgroundColor: config.bg }]}>
            <MaterialCommunityIcons
              name={config.icon}
              size={22}
              color={config.iconColor}
              style={styles.icon}
            />

            <Text style={[styles.text, { color: config.text }]}>{toast.message}</Text>

            {toast.actionLabel && toast.onAction && (
              <Pressable
                onPress={() => {
                  try {
                    toast.onAction?.();
                  } finally {
                    hideToast();
                  }
                }}
                hitSlop={10}
                style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.actionText, { color: config.text }]}>{toast.actionLabel}</Text>
              </Pressable>
            )}

            <Pressable
              onPress={hideToast}
              hitSlop={12}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 0.8 }, styles.closeBtn]}
            >
              <MaterialCommunityIcons name="close" size={18} color={config.text} />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 30, // "Pill" shape

    // Modern Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,

    // Layout constraints
    maxWidth: 600, // Tablet friendly
    width: 'auto',
    alignSelf: 'center',

    // Glassmorphism-lite border
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  icon: {
    marginRight: 10,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
    flexShrink: 1,
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: 2,
    marginLeft: 4,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    marginRight: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
