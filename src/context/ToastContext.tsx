import React, { createContext, useState, useContext, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- Types ---
type ToastType = 'success' | 'error' | 'info';

interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  hideToast: () => void;
}

// --- Context ---
const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  hideToast: () => {},
});

export const useToast = () => useContext(ToastContext);

// --- Configuration ---
const TOAST_CONFIG = {
  success: {
    bg: '#DEF7EC',
    text: '#03543F',
    iconColor: '#0E9F6E',
    icon: 'check-decagram',
  },
  error: {
    bg: '#FDE8E8',
    text: '#9B1C1C',
    iconColor: '#F05252',
    icon: 'alert-octagon',
  },
  info: {
    bg: '#E1EFFE',
    text: '#1E429F',
    iconColor: '#3F83F8',
    icon: 'information',
  },
};

// --- Component ---
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    setToast({ message, type, duration });

    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, duration);
  }, []);

  const contextValue = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast]);

  const config = toast ? TOAST_CONFIG[toast.type || 'info'] : TOAST_CONFIG.info;

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {toast && (
        <Animated.View
          entering={FadeInDown.springify().damping(15)}
          exiting={FadeOutUp}
          style={[styles.container, { top: insets.top + 10 }]}
        >
          <View style={[styles.card, { backgroundColor: config.bg }]}>
            <MaterialCommunityIcons
              name={config.icon as any}
              size={24}
              color={config.iconColor}
              style={styles.icon}
            />

            <Text style={[styles.text, { color: config.text }]}>{toast.message}</Text>

            <Pressable onPress={hideToast} hitSlop={10}>
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={config.text}
                style={{ opacity: 0.5 }}
              />
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
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center', // Centers the card horizontally
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 50, // Increased radius for "Floating Pill" look

    // Auto width logic
    alignSelf: 'center',
    minWidth: '40%',
    maxWidth: '90%', // Prevents it from touching edges on small screens

    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,

    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  icon: {
    marginRight: 10,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 10,
    flexShrink: 1, // Ensures text wraps if it hits maxWidth
  },
});
