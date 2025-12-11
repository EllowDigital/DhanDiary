import React, { createContext, useState, useContext, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const ToastContext = createContext({ showToast: (msg: string) => {} });

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [message, setMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {message && (
        <View style={styles.toast}>
          <Text style={styles.text}>{message}</Text>
        </View>
      )}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    zIndex: 1000,
  },
  text: {
    color: 'white',
  },
});
