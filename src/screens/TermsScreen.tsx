import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Sync banner is a floating overlay now; no per-screen layout adjustments needed.
import { Text } from '@rneui/themed';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors, spacing } from '../utils/design';

// --- CONFIGURATION ---
const LAST_UPDATED = 'December 14, 2025';
const CONTACT_EMAIL_PRIMARY = 'ellowdigitalindia@gmail.com';
const CONTACT_EMAIL_SECONDARY = 'sarwanyadav6174@gmail.com';

// --- TYPES ---
interface TermSectionData {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
}

const SECTIONS: TermSectionData[] = [
  {
    id: 'usage',
    icon: 'file-document-edit-outline',
    title: 'Using DhanDiary',
    body: 'DhanDiary is provided for tracking your personal finances. You may not use the app for unlawful activity, automated scraping, or to host malicious content. We reserve the right to suspend accounts that abuse the service.',
  },
  {
    id: 'security',
    icon: 'shield-lock-outline',
    title: 'Accounts & Security',
    body: 'Keep your password secret and device secure. You are responsible for transactions recorded using your credentials. If you suspect unauthorized access, change your password immediately and contact support.',
  },
  {
    id: 'data',
    icon: 'cloud-check-outline',
    title: 'Local & Cloud Data',
    body: 'Your entries are stored on your device first. When you log in, the app syncs with EllowDigital servers. Deleting the app does not automatically erase cloud backups—submit a deletion request to purge cloud data.',
  },
  {
    id: 'payments',
    icon: 'credit-card-outline',
    title: 'Payments',
    body: 'The current version of DhanDiary is free. If we add paid features in the future, pricing and billing terms will be communicated clearly inside the app before any charge is applied.',
  },
  {
    id: 'availability',
    icon: 'server-network',
    title: 'Availability',
    body: 'We strive for high uptime but cannot guarantee uninterrupted service. Scheduled maintenance or third-party infrastructure providers may occasionally cause brief downtime.',
  },
  {
    id: 'changes',
    icon: 'update',
    title: 'Changes',
    body: 'We may update these Terms to reflect new features or regulations. Significant changes will be highlighted in-app. Continued use of DhanDiary implies acceptance of the updated Terms.',
  },
];

// --- SUB-COMPONENTS ---

const TermCard = ({ item }: { item: TermSectionData }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons name={item.icon} size={20} color={colors.primary || '#2563EB'} />
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
    </View>
    <Text style={styles.cardBody}>{item.body}</Text>
  </View>
);

const TermsScreen = () => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const contentMaxWidth = 700;

  const handleEmailPress = async (email: string) => {
    const url = `mailto:${email}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert('Error', 'Could not open email client.');
    } catch (err) {
      console.warn(err);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background || '#F8FAFC'} />

      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'left', 'right'] as any}
      >
        {/* Header constrained to max width */}
        <View
          style={{
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: isTablet ? 0 : 16,
          }}
        >
          <ScreenHeader
            title="Terms of Use"
            subtitle="Rights & Responsibilities"
            showScrollHint={false}
            useSafeAreaPadding={false}
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: isTablet ? 0 : 16,
              width: '100%',
              maxWidth: contentMaxWidth,
              alignSelf: 'center',
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Intro Text */}
          <Text style={styles.leadText}>
            Please read these Terms carefully before using{' '}
            <Text style={styles.bold}>DhanDiary</Text>. By creating an account or continuing to use
            the app, you agree to the rules below.
          </Text>

          {/* Sections */}
          {SECTIONS.map((section) => (
            <TermCard key={section.id} item={section} />
          ))}

          {/* Contact Section */}
          <View style={[styles.card, styles.contactCard]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, styles.contactIconBg]}>
                <MaterialCommunityIcons name="email-fast-outline" size={20} color="#0284C7" />
              </View>
              <Text style={styles.cardTitle}>Contact Us</Text>
            </View>

            <Text style={styles.cardBody}>
              Have questions regarding these terms? We'll get back to you within a few business
              days.
            </Text>

            <View style={styles.contactLinks}>
              <TouchableOpacity
                onPress={() => handleEmailPress(CONTACT_EMAIL_PRIMARY)}
                activeOpacity={0.7}
                style={styles.emailButton}
              >
                <MaterialCommunityIcons
                  name="email-outline"
                  size={18}
                  color={colors.primary || '#2563EB'}
                />
                <Text style={styles.linkText}>{CONTACT_EMAIL_PRIMARY}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleEmailPress(CONTACT_EMAIL_SECONDARY)}
                activeOpacity={0.7}
                style={styles.emailButton}
              >
                <MaterialCommunityIcons
                  name="shield-account-outline"
                  size={18}
                  color={colors.muted || '#64748B'}
                />
                <Text style={styles.secondaryEmail}>Alt: {CONTACT_EMAIL_SECONDARY}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Last updated: {LAST_UPDATED}</Text>
            <Text style={styles.footerSubText}>© {new Date().getFullYear()} EllowDigital</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default TermsScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background || '#F8FAFC',
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
    paddingTop: 10,
  },
  leadText: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.text || '#1E293B',
    marginBottom: spacing(3),
    opacity: 0.9,
  },
  bold: {
    fontWeight: '700',
    color: colors.primary || '#2563EB',
  },

  // Card Styles
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing(2.5),
    marginBottom: spacing(2),
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(1.5),
    gap: spacing(1.5),
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F0FDF4', // Light green default
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text || '#1E293B',
    flex: 1,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted || '#64748B',
  },

  // Contact Specifics
  contactCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  contactIconBg: {
    backgroundColor: '#E0F2FE', // Light Sky Blue
  },
  contactLinks: {
    marginTop: spacing(2),
    gap: 12,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary || '#2563EB',
  },
  secondaryEmail: {
    fontSize: 14,
    color: colors.muted || '#64748B',
    textDecorationLine: 'underline',
  },

  // Footer
  footer: {
    marginTop: spacing(2),
    alignItems: 'center',
    marginBottom: spacing(4),
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted || '#94A3B8',
    textAlign: 'center',
    opacity: 0.8,
  },
  footerSubText: {
    fontSize: 12,
    color: colors.muted || '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.6,
  },
});
