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

// Configuration
const COMPANY_NAME = 'EllowDigital';
const SUPPORT_EMAIL_PRIMARY = 'ellowdigitalindia@gmail.com';
const SUPPORT_EMAIL_SECONDARY = 'sarwanyadav6174@gmail.com';
const LAST_UPDATED = 'December 14, 2025';

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
    body: 'We use basic diagnostics to understand crashes. These services receive minimal technical metadata (device model, OS version) and never your financial entries.',
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
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons
          name={item.icon}
          size={20}
          color={colors.primary}
        />
      </View>
      <Text style={styles.sectionTitle}>{item.title}</Text>
    </View>
    <Text style={styles.sectionBody}>{item.body}</Text>
  </View>
);

const PrivacyPolicyScreen = () => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const contentWidth = Math.min(width - (isTablet ? spacing(8) : spacing(4)), 700);

  const handleEmailPress = async (email: string) => {
    const url = `mailto:${email}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Error', 'Could not open email client.');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        
        <View style={{ width: contentWidth, alignSelf: 'center' }}>
          <ScreenHeader
            title="Privacy Policy"
            subtitle="Data Protection & Rights"
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
            
            {/* Introduction */}
            <Text style={styles.leadText}>
              {COMPANY_NAME} built <Text style={styles.bold}>DhanDiary</Text> to help individuals
              track their cash flow safely. This policy explains what data we collect, why we process
              it, and your choices.
            </Text>

            {/* Policy Sections */}
            {sections.map((section) => (
              <PolicySection key={section.id} item={section} />
            ))}

            {/* Contact Section */}
            <View style={[styles.sectionContainer, styles.contactSection]}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconContainer, { backgroundColor: '#e0f2fe' }]}>
                  <MaterialCommunityIcons name="email-outline" size={20} color="#0284c7" />
                </View>
                <Text style={styles.sectionTitle}>Contact Us</Text>
              </View>
              <Text style={styles.sectionBody}>
                Questions or privacy requests? We aim to respond within 3 business days.
              </Text>

              <TouchableOpacity onPress={() => handleEmailPress(SUPPORT_EMAIL_PRIMARY)} activeOpacity={0.7}>
                <Text style={styles.emailLink}>{SUPPORT_EMAIL_PRIMARY}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleEmailPress(SUPPORT_EMAIL_SECONDARY)} activeOpacity={0.7}>
                <Text style={styles.secondaryEmail}>Alt: {SUPPORT_EMAIL_SECONDARY}</Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Last updated: {LAST_UPDATED}</Text>
              <Text style={styles.footerSubText}>Updates will be posted here.</Text>
            </View>

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
  // Section Card Styling
  sectionContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: spacing(2.5),
    marginBottom: spacing(2),
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(1.5),
    gap: spacing(1.5),
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f0fdf4', // Light green default
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted,
  },
  // Contact Specifics
  contactSection: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  emailLink: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing(2),
    textDecorationLine: 'underline',
  },
  secondaryEmail: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
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
    color: colors.muted,
    textAlign: 'center',
    opacity: 0.8,
  },
  footerSubText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.6,
  },
});