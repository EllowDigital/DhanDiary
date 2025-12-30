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
import { Text } from '@rneui/themed';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors, spacing } from '../utils/design';

// --- CONFIGURATION ---
const COMPANY_NAME = 'EllowDigital';
const SUPPORT_EMAIL_PRIMARY = 'ellowdigitalindia@gmail.com';
const SUPPORT_EMAIL_SECONDARY = 'sarwanyadav6174@gmail.com';
const LAST_UPDATED = 'December 14, 2025';

// --- TYPES ---
interface SectionData {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
}

const SECTIONS: SectionData[] = [
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

// --- SUB-COMPONENTS ---

const PolicyCard = ({ item }: { item: SectionData }) => (
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

const PrivacyPolicyScreen = () => {
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

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Header constrained to content width */}
        <View
          style={{
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: isTablet ? 0 : 16,
          }}
        >
          <ScreenHeader
            title="Privacy Policy"
            subtitle="Data Protection & Rights"
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
          {/* Introduction */}
          <Text style={styles.leadText}>
            {COMPANY_NAME} built <Text style={styles.bold}>DhanDiary</Text> to help individuals
            track their cash flow safely. This policy explains what data we collect, why we process
            it, and your choices.
          </Text>

          {/* Policy Sections */}
          {SECTIONS.map((section) => (
            <PolicyCard key={section.id} item={section} />
          ))}

          {/* Contact Section */}
          <View style={[styles.card, styles.contactCard]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, styles.contactIconBg]}>
                <MaterialCommunityIcons name="email-outline" size={20} color="#0284c7" />
              </View>
              <Text style={styles.cardTitle}>Contact Us</Text>
            </View>

            <Text style={styles.cardBody}>
              Questions or privacy requests? We aim to respond within 3 business days.
            </Text>

            <View style={styles.contactLinks}>
              <TouchableOpacity
                onPress={() => handleEmailPress(SUPPORT_EMAIL_PRIMARY)}
                activeOpacity={0.7}
                style={styles.emailButton}
              >
                <MaterialCommunityIcons
                  name="email-fast-outline"
                  size={18}
                  color={colors.primary || '#2563EB'}
                />
                <Text style={styles.emailLink}>{SUPPORT_EMAIL_PRIMARY}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleEmailPress(SUPPORT_EMAIL_SECONDARY)}
                activeOpacity={0.7}
                style={styles.emailButton}
              >
                <MaterialCommunityIcons
                  name="shield-account-outline"
                  size={18}
                  color={colors.muted || '#64748B'}
                />
                <Text style={styles.secondaryEmail}>Alt: {SUPPORT_EMAIL_SECONDARY}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Last updated: {LAST_UPDATED}</Text>
            <Text style={styles.footerSubText}>Updates will be posted here.</Text>
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
  emailLink: {
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
