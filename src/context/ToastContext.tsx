import React, { 
  createContext, 
  useState, 
  useContext, 
  useCallback, 
  useMemo, 
  useRef
} from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
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
  hideToast: () => {} 
});

export const useToast = () => useContext(ToastContext);

// --- Configuration ---
const TOAST_CONFIG = {
  success: { color: '#10B981', icon: 'check-circle' },
  error: { color: '#EF4444', icon: 'alert-circle' },
  info: { color: '#3B82F6', icon: 'information' },
};

// --- Component ---
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  
  // Ref to hold the timer so we can clear it if a new toast comes in
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    // 1. Clear existing timer if any
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // 2. Set new toast
    setToast({ message, type, duration });

    // 3. Start new timer
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, duration);
  }, []);

  const contextValue = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast]);

  // Determine styles based on type
  const activeConfig = toast ? TOAST_CONFIG[toast.type || 'info'] : TOAST_CONFIG.info;

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      
      {toast && (
        <Animated.View 
          entering={FadeInUp.springify().damping(15)}
          exiting={FadeOutUp}
          style={[
            styles.toastContainer, 
            { top: insets.top + 10 } // Dynamic Island positioning
          ]}
        >
          <Pressable onPress={hideToast} style={styles.toastContent}>
            
            {/* Icon Box */}
            <View style={[styles.iconContainer, { backgroundColor: activeConfig.color }]}>
              <MaterialCommunityIcons 
                name={activeConfig.icon as any} 
                size={18} 
                color="white" 
              />
            </View>

            {/* Message */}
            <Text style={styles.messageText} numberOfLines={2}>
              {toast.message}
            </Text>

          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999, // Ensure it sits on top of everything
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937', // Dark charcoal background
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 50, // Full Capsule
    
    // Modern Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    
    maxWidth: '90%',
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  messageText: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1, // Allows text to wrap if too long
  },
});