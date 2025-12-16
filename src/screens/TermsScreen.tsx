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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors, spacing } from '../utils/design';

// --- Configuration ---
const LAST_UPDATED = 'December 14, 2025';
const CONTACT_EMAIL_PRIMARY = 'ellowdigitalindia@gmail.com';
const CONTACT_EMAIL_SECONDARY = 'sarwanyadav6174@gmail.com';

// --- Data ---
const sections = [
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
    body: 'We strive for high uptime but cannot guarantee uninterrupted service. Scheduled maintenance or infrastructure partners (like Firebase and Expo services) may occasionally cause brief downtime.',
  },
  {
    id: 'changes',
    icon: 'update',
    title: 'Changes',
    body: 'We may update these Terms to reflect new features or regulations. Significant changes will be highlighted in-app. Continued use of DhanDiary implies acceptance of the updated Terms.',
  },
];

// --- Component for individual sections ---
const TermSection = ({ item }: { item: (typeof sections)[0] }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons name={item.icon as any} size={20} color={colors.primary} />
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
    </View>
    <Text style={styles.cardBody}>{item.body}</Text>
  </View>
);

const TermsScreen = () => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const contentWidth = Math.min(width - (isTablet ? spacing(8) : spacing(4)), 700);

  const handleEmailPress = async (email: string) => {
    const url = `mailto:${email}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Error', 'Could not open email client');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <View style={{ width: contentWidth, alignSelf: 'center' }}>
          <ScreenHeader
            title="Terms of Use"
            subtitle="Rights & Responsibilities"
            showScrollHint={false}
            useSafeAreaPadding={false}
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: contentWidth, alignSelf: 'center' }}>
            {/* Intro Text */}
            <Text style={styles.leadText}>
              Please read these Terms carefully before using{' '}
              <Text style={styles.bold}>DhanDiary</Text>. By creating an account or continuing to
              use the app, you agree to the rules below.
            </Text>

            {/* Mapped Sections */}
            {sections.map((section) => (
              <TermSection key={section.id} item={section} />
            ))}

            {/* Contact Section */}
            <View style={[styles.card, styles.contactCard]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: '#e0f2fe' }]}>
                  <MaterialCommunityIcons name="email-fast-outline" size={20} color="#0284c7" />
                </View>
                <Text style={styles.cardTitle}>Contact Us</Text>
              </View>
              <Text style={styles.cardBody}>
                Have questions? We'll get back to you within a few business days.
              </Text>

              <TouchableOpacity onPress={() => handleEmailPress(CONTACT_EMAIL_PRIMARY)}>
                <Text style={styles.linkText}>{CONTACT_EMAIL_PRIMARY}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleEmailPress(CONTACT_EMAIL_SECONDARY)}>
                <Text style={styles.secondaryEmail}>{CONTACT_EMAIL_SECONDARY}</Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Last updated: {LAST_UPDATED}</Text>
            </View>
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
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: spacing(2),
    gap: spacing(2),
  },
  leadText: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
    marginBottom: spacing(2),
    opacity: 0.8,
  },
  bold: {
    fontWeight: '700',
    color: colors.primary,
  },
  // Card Styling
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f0fdf4', // Light green default, overridden for contact
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted,
  },
  // Contact Specifics
  contactCard: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  linkText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 16,
  },
  secondaryEmail: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    textDecorationLine: 'underline',
  },
  // Footer
  footer: {
    marginTop: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  footerText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    opacity: 0.7,
  },
});
