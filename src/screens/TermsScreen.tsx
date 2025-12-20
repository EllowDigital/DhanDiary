import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors, spacing } from '../utils/design';

// --- Configuration ---
const LAST_UPDATED = 'December 10, 2025';
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
    body: 'We strive for high uptime but cannot guarantee uninterrupted service. Scheduled maintenance or infrastructure partners (like Neon DB and Expo services) may occasionally cause brief downtime.',
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
      <MaterialCommunityIcons
        name={item.icon as any}
        size={22}
        color={colors.primary || '#007AFF'}
        style={styles.icon}
      />
      <Text style={styles.cardTitle}>{item.title}</Text>
    </View>
    <Text style={styles.cardBody}>{item.body}</Text>
  </View>
);

const TermsScreen = () => {
  const handleEmailPress = async () => {
    const url = `mailto:${CONTACT_EMAIL_PRIMARY}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Error', 'Could not open email client');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="Terms of Use"
          subtitle="Understand your rights & responsibilities"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Intro Text */}
          <Text style={styles.leadText}>
            Please read these Terms carefully before using{' '}
            <Text style={styles.bold}>DhanDiary</Text>. By creating an account or continuing to use
            the app, you agree to the rules below.
          </Text>

          {/* Mapped Sections */}
          {sections.map((section) => (
            <TermSection key={section.id} item={section} />
          ))}

          {/* Contact Section (Distinct Style) */}
          <View style={[styles.card, styles.contactCard]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="email-fast-outline" size={22} color={colors.text} />
              <Text style={styles.cardTitle}>Contact Us</Text>
            </View>
            <Text style={styles.cardBody}>
              Have questions? We'll get back to you within a few business days.
            </Text>

            <TouchableOpacity onPress={handleEmailPress}>
              <Text style={styles.linkText}>{CONTACT_EMAIL_PRIMARY}</Text>
            </TouchableOpacity>
            <Text style={styles.secondaryEmail}>{CONTACT_EMAIL_SECONDARY}</Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Last updated: {LAST_UPDATED}</Text>
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
    paddingHorizontal: spacing(2.5),
    paddingTop: spacing(2),
    paddingBottom: spacing(6),
    gap: spacing(2),
  },
  leadText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.subtleText || '#666',
    marginBottom: spacing(1),
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  // Card Styling
  card: {
    backgroundColor: colors.card || '#fff',
    borderRadius: 16,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: colors.border || '#e0e0e0',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(1),
    gap: spacing(1.5),
  },
  icon: {
    opacity: 0.9,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted || '#555',
  },
  // Contact Specifics
  contactCard: {
    backgroundColor: colors.background === '#000' ? '#222' : '#F9FAFB',
  },
  linkText: {
    fontSize: 15,
    color: colors.primary || '#007AFF',
    fontWeight: '600',
    marginTop: spacing(1.5),
    textDecorationLine: 'underline',
  },
  secondaryEmail: {
    fontSize: 13,
    color: colors.muted || '#888',
    marginTop: 4,
  },
  // Footer
  footer: {
    marginTop: spacing(1),
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: colors.muted || '#999',
    textAlign: 'center',
  },
});
