import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export const useInternetStatus = () => {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    // initialize once with current state so hooks depending on this
    // get the accurate connectivity right away (helps triggering
    // sync when a user logs in while already online)
    let mounted = true;
    NetInfo.fetch()
      .then((s) => {
        if (mounted) setIsOnline(!!s.isConnected);
      })
      .catch(() => {});

    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable can be null initially
      setIsOnline(!!state.isConnected);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return isOnline;
};
