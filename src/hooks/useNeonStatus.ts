import { useEffect, useState } from 'react';
import { getNeonHealth, warmNeonConnection, type NeonHealthSnapshot } from '../api/neonClient';

export type NeonStatusDescriptor = {
  label: string;
  icon: string;
  tone: 'positive' | 'warning' | 'neutral';
};

/**
 * Hook that exposes lightweight Neon health metadata so UI can surface
 * connectivity hints without forcing extra requests.
 */
export const useNeonStatus = (refreshMs = 6000) => {
  const [health, setHealth] = useState<NeonHealthSnapshot>(() => getNeonHealth());

  useEffect(() => {
    let mounted = true;

    const refresh = () => {
      if (!mounted) return;
      setHealth(getNeonHealth());
    };

    refresh();
    warmNeonConnection()
      .catch(() => {})
      .finally(refresh);
    const interval = setInterval(refresh, refreshMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [refreshMs]);

  return health;
};

export const describeNeonHealth = (health: NeonHealthSnapshot): NeonStatusDescriptor => {
  if (!health.isConfigured) {
    return { label: 'Local mode', icon: 'offline-bolt', tone: 'neutral' };
  }

  const healthyRecently = !!health.lastHealthyAt && Date.now() - health.lastHealthyAt < 15000;
  if (healthyRecently) {
    const latencyLabel = health.lastLatencyMs
      ? `${Math.round(health.lastLatencyMs)}ms`
      : 'Cloud good';
    return { label: latencyLabel, icon: 'cloud-done', tone: 'positive' };
  }

  if (health.lastErrorMessage) {
    return { label: 'Reconnecting…', icon: 'cloud-off', tone: 'warning' };
  }

  return { label: 'Checking link…', icon: 'cloud-queue', tone: 'neutral' };
};
