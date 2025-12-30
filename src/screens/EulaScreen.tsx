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

// --- CONFIG ---
const LAST_UPDATED = 'December 12, 2025';
const CONTACT_EMAIL_PRIMARY = 'ellowdigitalindia@gmail.com';
const CONTACT_EMAIL_SECONDARY = 'sarwanyadav6174@gmail.com';

type EulaSectionData = {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
};

const SECTIONS: EulaSectionData[] = [
  {
    id: 'license',
    icon: 'file-certificate-outline',
    title: 'License Grant',
    body: 'We grant you a limited, revocable, non-transferable license to install and use DhanDiary on devices you own or control for personal finance or internal business record keeping.',
  },
  {
    id: 'restrictions',
    icon: 'shield-key-outline',
    title: 'Usage Restrictions',
    body: 'You may not rent, sell, sublicense, reverse engineer, or circumvent safeguards inside the app. Only modify or decompile when local law explicitly allows it.',
  },
  {
    id: 'updates',
    icon: 'update',
    title: 'Updates & Support',
    body: 'Future patches may install automatically. While we aim to keep the product reliable, we are not obligated to deliver ongoing updates or support.',
  },
  {
    id: 'ownership',
    icon: 'copyright',
    title: 'Ownership',
    body: 'EllowDigital retains all intellectual property rights to DhanDiary and its trademarks. This EULA does not transfer any ownership to you.',
  },
  {
    id: 'components',
    icon: 'puzzle-outline',
    title: 'Third-Party Components',
    body: 'The app may include open-source or third-party libraries covered by their own licenses. Those terms remain in effect for the relevant components.',
  },
  {
    id: 'termination',
    icon: 'close-circle-outline',
    title: 'Termination',
    body: 'This license ends if you fail to comply with these terms. When terminated, uninstall DhanDiary and delete all copies in your possession.',
  },
  {
    id: 'export',
    icon: 'airplane-takeoff',
    title: 'Export Compliance',
    body: 'You agree to follow all export and compliance laws that apply to software originating from India and any other relevant jurisdiction.',
  },
  {
    id: 'warranty',
    icon: 'alert-circle-outline',
    title: 'Warranty & Liability',
    body: 'DhanDiary is provided “as is.” We disclaim implied warranties and limit liability to the fees you paid (or INR 500 if unpaid). We are not liable for indirect or consequential damages.',
  },
];

// --- COMPONENTS ---

const EulaCard = ({ item }: { item: EulaSectionData }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons name={item.icon} size={22} color={colors.primary || '#2563EB'} />
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
    </View>
    <Text style={styles.cardBody}>{item.body}</Text>
  </View>
);

const EulaScreen = () => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const contentMaxWidth = 700;
  
  // Calculate responsive padding
  const horizontalPadding = isTablet ? (width - contentMaxWidth) / 2 : spacing(4);

  const handleEmailPress = async (email: string) => {
    const url = `mailto:${email}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('No Email App', 'Could not find an email application to open this link.');
      }
    } catch (err) {
      console.warn(err);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background || '#F8FAFC'} />
      
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Header container constrained to max width */}
        <View style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: isTablet ? 0 : 16 }}>
          <ScreenHeader
            title="End User License"
            subtitle="Terms of Service & EULA"
            showScrollHint={false}
            useSafeAreaPadding={false}
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent, 
            { paddingHorizontal: isTablet ? 0 : 16, width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.leadText}>
            By downloading or using <Text style={styles.bold}>DhanDiary</Text>, you agree to this
            End User License Agreement. If you do not agree, you must uninstall the app immediately.
          </Text>

          {SECTIONS.map((section) => (
            <EulaCard key={section.id} item={section} />
          ))}

          {/* Contact Section */}
          <View style={[styles.card, styles.contactCard]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, styles.contactIconBg]}>
                <MaterialCommunityIcons name="email-fast-outline" size={22} color="#0284C7" />
              </View>
              <Text style={styles.cardTitle}>Contact & Support</Text>
            </View>
            
            <Text style={styles.cardBody}>
              Questions about this license? Reach out and we will reply within a few business days.
            </Text>

            <View style={styles.contactLinks}>
              <TouchableOpacity 
                onPress={() => handleEmailPress(CONTACT_EMAIL_PRIMARY)}
                activeOpacity={0.7}
                style={styles.emailButton}
              >
                <MaterialCommunityIcons name="email-outline" size={18} color={colors.primary || '#2563EB'} />
                <Text style={styles.linkText}>{CONTACT_EMAIL_PRIMARY}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => handleEmailPress(CONTACT_EMAIL_SECONDARY)}
                activeOpacity={0.7}
                style={styles.emailButton}
              >
                <MaterialCommunityIcons name="account-outline" size={18} color={colors.muted || '#64748B'} />
                <Text style={styles.secondaryEmail}>{CONTACT_EMAIL_SECONDARY}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Last updated: {LAST_UPDATED}</Text>
            <Text style={styles.footerSubText}>© {new Date().getFullYear()} EllowDigital. All rights reserved.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default EulaScreen;

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
    marginBottom: 24,
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
    padding: 20,
    marginBottom: 16,
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
    marginBottom: 12,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft || '#EFF6FF',
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
    backgroundColor: '#F8FAFC', // Slightly darker bg for contact
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  contactIconBg: {
    backgroundColor: '#E0F2FE', // Light Sky Blue
  },
  contactLinks: {
    marginTop: 16,
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
    color: colors.primary || '#2563EB',
    fontWeight: '600',
  },
  secondaryEmail: {
    fontSize: 14,
    color: colors.muted || '#64748B',
    textDecorationLine: 'underline',
  },

  // Footer
  footer: {
    marginTop: 32,
    alignItems: 'center',
    marginBottom: 20,
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted || '#94A3B8',
  },
  footerSubText: {
    fontSize: 11,
    color: '#CBD5E1',
  },
});