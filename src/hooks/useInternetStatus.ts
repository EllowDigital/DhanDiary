import { useRef, useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export const useInternetStatus = () => {
  const [isOnline, setIsOnline] = useState(false);
  const lastOnlineRef = useRef<boolean>(false);

  useEffect(() => {
    // initialize once with current state so hooks depending on this
    // get the accurate connectivity right away (helps triggering
    // sync when a user logs in while already online)
    let mounted = true;
    NetInfo.fetch()
      .then((s) => {
        const next = !!s.isConnected;
        if (!mounted) return;
        if (lastOnlineRef.current !== next) {
          lastOnlineRef.current = next;
          setIsOnline(next);
        }
      })
      .catch(() => {});

    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable can be null initially
      const next = !!state.isConnected;
      if (lastOnlineRef.current === next) return;
      lastOnlineRef.current = next;
      setIsOnline(next);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return isOnline;
};
