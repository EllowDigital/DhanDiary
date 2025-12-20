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

const LAST_UPDATED = 'December 12, 2025';
const CONTACT_EMAIL_PRIMARY = 'ellowdigitalindia@gmail.com';
const CONTACT_EMAIL_SECONDARY = 'sarwanyadav6174@gmail.com';

const sections = [
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

const EulaSection = ({ item }: { item: (typeof sections)[0] }) => (
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

const EulaScreen = () => {
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
          title="End User License"
          subtitle="Terms for installing & using DhanDiary"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.leadText}>
            By downloading or using <Text style={styles.bold}>DhanDiary</Text>, you agree to this
            End User License Agreement. If you do not agree, you must uninstall the app.
          </Text>

          {sections.map((section) => (
            <EulaSection key={section.id} item={section} />
          ))}

          <View style={[styles.card, styles.contactCard]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="email-fast-outline" size={22} color={colors.text} />
              <Text style={styles.cardTitle}>Contact</Text>
            </View>
            <Text style={styles.cardBody}>
              Questions about this license? Reach out and we will reply within a few business days.
            </Text>

            <TouchableOpacity onPress={handleEmailPress}>
              <Text style={styles.linkText}>{CONTACT_EMAIL_PRIMARY}</Text>
            </TouchableOpacity>
            <Text style={styles.secondaryEmail}>{CONTACT_EMAIL_SECONDARY}</Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Last updated: {LAST_UPDATED}</Text>
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
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card || '#fff',
    borderRadius: 16,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: colors.border || '#e0e0e0',
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
