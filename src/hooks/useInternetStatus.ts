import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export const useInternetStatus = () => {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable can be null initially
      setIsOnline(!!state.isConnected);
    });
    return unsubscribe;
  }, []);

  return isOnline;
};
