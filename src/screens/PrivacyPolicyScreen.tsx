import React from 'react';
import { View, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import ScreenHeader from '../components/ScreenHeader';
import { colors, spacing } from '../utils/design';

const COMPANY_NAME = 'EllowDigital';
const SUPPORT_EMAIL = 'sarwanyadav26@outlook.com';

const sections = [
  {
    title: 'What We Collect',
    body: 'DhanDiary stores the information you add inside the app, such as income, expenses, notes, categories, session details, and optional profile information. We also keep anonymous diagnostics that help us improve app stability.',
  },
  {
    title: 'How We Use Data',
    body: 'Your entries stay on your device first. When you sign in, encrypted sync keeps your records backed up across devices so that you can recover them if you reinstall the app. We analyse aggregated totals locally to show trends and insights, and never sell your personal data.',
  },
  {
    title: 'Offline & Sync',
    body: 'You can continue logging transactions without an internet connection. When the app detects connectivity, it pushes queued updates to EllowDigital servers and pulls the latest changes to keep all devices aligned.',
  },
  {
    title: 'Analytics & Third Parties',
    body: 'We use basic diagnostics from Expo and React Native libraries to understand crashes or performance bottlenecks. These services receive minimal technical metadata (device model, OS version) and do not receive your financial entries.',
  },
  {
    title: 'Your Controls',
    body: 'Use the Account and Settings screens to update your profile, trigger a manual sync, or clear all local data. To remove your cloud backup entirely, request deletion through the support email below.',
  },
  {
    title: 'Contact',
    body: `Questions or privacy requests? Email ${SUPPORT_EMAIL}. We aim to respond within 3 business days.`,
  },
];

const PrivacyPolicyScreen = () => {
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
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lead}>
            {COMPANY_NAME} built DhanDiary to help individuals track their cash flow safely. This
            policy explains what data we collect, why we process it, and the choices you have inside
            the app.
          </Text>

          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}

          <Text style={styles.footerText}>
            This policy was last updated on December 10, 2025. Future updates will be shared inside
            the app after significant changes.
          </Text>
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
  content: {
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(2),
    gap: spacing(2),
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.subtleText,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
  },
  footerText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing(2),
  },
});
