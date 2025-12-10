import React from 'react';
import { View, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import ScreenHeader from '../components/ScreenHeader';
import { colors, spacing } from '../utils/design';

const sections = [
  {
    title: 'Using DhanDiary',
    body: 'DhanDiary is provided for tracking your personal finances. You may not use the app for unlawful activity, automated scraping, or to host malicious content. We can suspend accounts that abuse the service or compromise the experience for others.',
  },
  {
    title: 'Accounts & Security',
    body: 'Keep your password secret and device secure. You are responsible for transactions recorded using your credentials. If you suspect unauthorized access, change your password and contact support so we can help protect your data.',
  },
  {
    title: 'Local & Cloud Data',
    body: 'Your entries are stored on your device first. When you log in, the app syncs with EllowDigital servers to keep a cloud backup. Deleting the app from a device does not automatically erase cloud backups—submit a deletion request if you need data purged.',
  },
  {
    title: 'Payments',
    body: 'The current version of DhanDiary is free. If we add paid features in the future, pricing and billing terms will be communicated clearly inside the app before any charge is applied.',
  },
  {
    title: 'Availability',
    body: 'We strive for high uptime but cannot guarantee uninterrupted service. Scheduled maintenance or infrastructure partners (like Neon DB and Expo services) may occasionally cause brief downtime.',
  },
  {
    title: 'Changes',
    body: 'We may update these Terms to reflect new features or regulations. Significant changes will be highlighted in-app, and continued use of DhanDiary means you accept the updated Terms.',
  },
  {
    title: 'Contact',
    body: 'Have questions? Email sarwanyadav26@outlook.com and we will respond within a few business days.',
  },
];

const TermsScreen = () => {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="Terms of Use"
          subtitle="Understand your rights and responsibilities"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lead}>
            Please read these Terms carefully before using DhanDiary. By creating an account or
            continuing to use the app you agree to the rules below.
          </Text>

          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}

          <Text style={styles.footerText}>These Terms were last updated on December 10, 2025.</Text>
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
