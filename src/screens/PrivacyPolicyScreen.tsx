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
import { MaterialCommunityIcons } from '@expo/vector-icons'; // Assuming you use Expo or have vector-icons installed
import ScreenHeader from '../components/ScreenHeader';
import { colors, spacing } from '../utils/design';

// Configuration
const COMPANY_NAME = 'EllowDigital';
const SUPPORT_EMAIL_PRIMARY = 'ellowdigitalindia@gmail.com';
const SUPPORT_EMAIL_SECONDARY = 'sarwanyadav6174@gmail.com';
const LAST_UPDATED = 'December 12, 2025';

// Data Model
interface SectionData {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
}

const sections: SectionData[] = [
  {
    id: 'collect',
    icon: 'database-arrow-down-outline',
    title: 'What We Collect',
    body: 'DhanDiary stores the information you add inside the app, such as income, expenses, notes, categories, and session details. We collect anonymous diagnostics to help improve app stability.',
  },
  {
    id: 'usage',
    icon: 'shield-account-outline',
    title: 'How We Use Data',
    body: 'Your entries stay on your device first. When you sign in, encrypted sync keeps your records backed up. We analyze aggregated totals locally to show trends, and never sell your personal data.',
  },
  {
    id: 'sync',
    icon: 'cloud-sync-outline',
    title: 'Offline & Sync',
    body: 'You can continue logging transactions offline. When connectivity is restored, the app pushes queued updates to EllowDigital servers and pulls changes to keep devices aligned.',
  },
  {
    id: 'analytics',
    icon: 'chart-box-outline',
    title: 'Analytics & Third Parties',
    body: 'We use basic diagnostics (Expo/React Native libraries) to understand crashes. These services receive minimal technical metadata (device model, OS version) and never your financial entries.',
  },
  {
    id: 'controls',
    icon: 'cog-outline',
    title: 'Your Controls',
    body: 'Use Settings to update your profile or clear local data. To remove your cloud backup entirely, please request deletion via support.',
  },
];

// Reusable Section Component
const PolicySection = ({ item }: { item: SectionData }) => (
  <View style={styles.sectionContainer}>
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons
        name={item.icon}
        size={20}
        color={colors.primary || '#007AFF'} // Fallback if primary color isn't in your utils
        style={styles.sectionIcon}
      />
      <Text style={styles.sectionTitle}>{item.title}</Text>
    </View>
    <Text style={styles.sectionBody}>{item.body}</Text>
  </View>
);

const PrivacyPolicyScreen = () => {
  const handleEmailPress = async () => {
    const url = `mailto:${SUPPORT_EMAIL_PRIMARY}`;
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Could not open email client.');
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="Privacy Policy"
          subtitle="How DhanDiary protects your data"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Introduction */}
          <Text style={styles.leadText}>
            {COMPANY_NAME} built <Text style={styles.bold}>DhanDiary</Text> to help individuals track their cash flow safely.
            This policy explains what data we collect, why we process it, and your choices.
          </Text>

          {/* Policy Sections */}
          {sections.map((section) => (
            <PolicySection key={section.id} item={section} />
          ))}

          {/* Contact Section (Special Styling) */}
          <View style={[styles.sectionContainer, styles.contactSection]}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="email-outline" size={20} color={colors.text} />
              <Text style={styles.sectionTitle}>Contact Us</Text>
            </View>
            <Text style={styles.sectionBody}>
              Questions or privacy requests? We aim to respond within 3 business days.
            </Text>
            
            <TouchableOpacity onPress={handleEmailPress} activeOpacity={0.7}>
              <Text style={styles.emailLink}>{SUPPORT_EMAIL_PRIMARY}</Text>
            </TouchableOpacity>
            
            <Text style={styles.secondaryEmail}>
              Alternative: {SUPPORT_EMAIL_SECONDARY}
            </Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Last updated: {LAST_UPDATED}
            </Text>
            <Text style={styles.footerSubText}>
              Future updates will be shared inside the app.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default PrivacyPolicyScreen;

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
    paddingBottom: spacing(6), // Extra padding at bottom for scroll feel
    gap: spacing(2),
  },
  leadText: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.subtleText || '#666',
    marginBottom: spacing(1),
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  // Section Card Styling
  sectionContainer: {
    backgroundColor: colors.card || '#FFFFFF',
    borderRadius: 16,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: colors.border || '#E5E5E5',
    // iOS Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    // Android Shadow
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(1),
    gap: spacing(1.5),
  },
  sectionIcon: {
    opacity: 0.9,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted || '#555',
  },
  // Contact Specifics
  contactSection: {
    backgroundColor: (colors.background === '#000' || colors.background === '#121212') ? '#1E1E1E' : '#F8F9FA', // Slight contrast for contact
    borderColor: colors.border,
  },
  emailLink: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary || '#007AFF',
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
    marginTop: spacing(2),
    alignItems: 'center',
    paddingHorizontal: spacing(4),
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.subtleText || '#999',
    textAlign: 'center',
  },
  footerSubText: {
    fontSize: 12,
    color: colors.muted || '#AAA',
    textAlign: 'center',
    marginTop: 4,
  },
});