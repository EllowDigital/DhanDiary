import React, { useEffect } from 'react';
import Constants from 'expo-constants';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  ScrollView,
  Dimensions,
  Share,
} from 'react-native';
import { Text, Button } from '@rneui/themed';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

const ELLOW_URL = 'https://ellowdigital.netlify.app';
import getLatestShareLink from '../utils/shareLink';

const pkg = require('../../package.json');

// Build / runtime metadata (set via EAS config or CI env)
const extra: any = (Constants as any)?.expoConfig?.extra || {};
const BUILD_TYPE =
  process.env.BUILD_TYPE ||
  extra.BUILD_TYPE ||
  (pkg.version.includes('-beta') ? 'Beta' : 'Release');
const BUILD_COMMIT = process.env.BUILD_COMMIT || extra.BUILD_COMMIT || 'local';
const BUILD_TIMESTAMP = process.env.BUILD_TIMESTAMP || extra.BUILD_TIMESTAMP || null;

const AboutScreen: React.FC = () => {
  const fade = useSharedValue(0);

  /* Fade In Animation */
  useEffect(() => {
    fade.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, []);

  const animatedFadeStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 16 }],
  }));

  /* Fetch latest share link (normalized) */
  const fetchShareLink = async () => {
    try {
      const link = await getLatestShareLink();
      return link || 'https://ellowdigital.netlify.app';
    } catch (err) {
      console.log('Failed to fetch latest link:', err);
      return 'https://ellowdigital.netlify.app'; // fallback link
    }
  };

  /* SHARE APP BUTTON */
  const handleShare = async () => {
    const latestLink = await fetchShareLink();

    try {
      await Share.share({
        title: 'DhanDiary – Smart Personal Finance Tracker',
        message: `📲 Check out DhanDiary! Smart personal finance & expense manager.\n\nDownload now 👉 ${latestLink}`,
      });
    } catch (err) {
      console.log('Share error:', err);
    }
  };

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );

  return (
    <Animated.View style={[styles.container, animatedFadeStyle]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* HEADER: horizontal layout - icon left, text right */}
        <View style={styles.headerContainer}>
          <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
          <View style={styles.headerText}>
            <Text style={styles.appName}>DhanDiary</Text>
            <Text style={styles.appSubtitle}>Smart Personal Finance Tracker</Text>
          </View>
        </View>

        {/* MAIN CARD */}
        <View style={styles.card}>
          <InfoRow label="App Version" value={pkg.version} />
          <InfoRow label="Build Type" value={String(BUILD_TYPE)} />
          <InfoRow
            label="Environment"
            value={process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}
          />
          <InfoRow label="Commit" value={String(BUILD_COMMIT).slice(0, 12)} />
          <InfoRow
            label="Built"
            value={BUILD_TIMESTAMP ? new Date(BUILD_TIMESTAMP).toLocaleString() : 'local/dev'}
          />

          <Text style={styles.description}>
            DhanDiary helps you manage expenses, income, and personal finances with a powerful
            offline-first system that syncs automatically when you're online.
          </Text>
        </View>

        {/* ACTIONS */}
        <Button
          title="Share with Friends"
          onPress={handleShare}
          icon={
            <MaterialIcon name="share" color="#fff" size={font(18)} style={{ marginRight: 8 }} />
          }
          buttonStyle={styles.actionButton}
          titleStyle={styles.actionButtonTitle}
        />
        <Button
          title="Contact Developer"
          onPress={() =>
            Linking.openURL(`mailto:sarwanyadav26@outlook.com?subject=DhanDiary%20Feedback`)
          }
          icon={
            <MaterialIcon name="email" color="#334155" size={font(18)} style={{ marginRight: 8 }} />
          }
          buttonStyle={[styles.actionButton, styles.secondaryActionButton]}
          titleStyle={[styles.actionButtonTitle, styles.secondaryActionButtonTitle]}
        />

        {/* FOOTER */}
        <TouchableOpacity style={styles.footer} onPress={() => Linking.openURL(ELLOW_URL)}>
          <Text style={styles.footerText}>
            Crafted with ❤️ by <Text style={styles.footerLink}>EllowDigital</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
};

// Re-import MaterialIcon if it's not already imported
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

export default AboutScreen;

/* MODERN, CLEAN STYLES */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 30,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  appIcon: {
    width: 84,
    height: 84,
    borderRadius: 16,
    marginRight: 16,
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  headerText: {
    flex: 1,
    justifyContent: 'center',
  },
  appName: {
    fontSize: font(22),
    fontWeight: '800',
    color: '#0F172A',
  },
  appSubtitle: {
    fontSize: font(14),
    color: '#475569',
    marginTop: 6,
    fontWeight: '600',
  },

  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  label: {
    fontSize: font(15),
    color: '#64748B',
  },
  value: {
    fontSize: font(15),
    fontWeight: '600',
    color: '#1E293B',
  },
  description: {
    paddingTop: 16,
    fontSize: font(15),
    color: '#475569',
    lineHeight: 23,
  },

  actionButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  actionButtonTitle: {
    fontSize: font(16),
    fontWeight: '600',
  },
  secondaryActionButton: {
    backgroundColor: '#E2E8F0',
  },
  secondaryActionButtonTitle: {
    color: '#334155',
  },

  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: font(14),
    color: '#64748B',
  },
  footerLink: {
    fontWeight: 'bold',
    color: '#2563EB',
  },
});
