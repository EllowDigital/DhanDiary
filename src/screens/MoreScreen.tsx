import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Linking,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { colors, shadows } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';

type RouteName = 'Settings' | 'About' | 'Account' | 'Stats' | 'AccountManagementScreen' | string;

const MoreScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object>>>();
  const [scrollOffset, setScrollOffset] = useState(0);
  const insets = useSafeAreaInsets();

  const navigateParent = useCallback(
    (route: RouteName) => {
      navigation.navigate(route as any);
    },
    [navigation]
  );

  const primaryLinks = useMemo(
    () => [
      {
        icon: 'insights',
        label: 'Stats & Analytics',
        description: 'Detailed trends & KPIs',
        action: () => navigateParent('Stats'),
      },
      {
        icon: 'admin-panel-settings',
        label: 'Account Management',
        description: 'Profiles, security, device access',
        action: () => navigateParent('Account'),
      },
      {
        icon: 'settings',
        label: 'Settings',
        description: 'Preferences, categories, backups',
        action: () => navigateParent('Settings'),
      },
      {
        icon: 'info-outline',
        label: 'About & Updates',
        description: 'Version info, OTA releases',
        action: () => navigateParent('About'),
      },
    ],
    [navigateParent]
  );

  const supportLinks = useMemo(
    () => [
      {
        icon: 'emoji-objects',
        label: 'Roadmap & Changelog',
        description: 'What shipped and what is next',
        action: () => Linking.openURL('https://ellowdigital.netlify.app'),
      },
      {
        icon: 'support-agent',
        label: 'Contact Support',
        description: 'Email the DhanDiary crew',
        action: () =>
          Linking.openURL(
            'mailto:sarwanyadav26@outlook.com?subject=DhanDiary%20Support&body=Hi%20team%2C'
          ),
      },
    ],
    []
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffset(event.nativeEvent.contentOffset.y);
  }, []);

  const Row = ({
    icon,
    label,
    description,
    onPress,
    isLast = false,
  }: {
    icon: string;
    label: string;
    description?: string;
    onPress: () => void;
    isLast?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.surfaceMuted }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, isLast && styles.rowLast]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.rowLeft}>
        <View style={styles.iconContainer}>
          <MaterialIcon name={icon as any} size={18} color={colors.primary} />
        </View>
        <View>
          <Text style={styles.rowText}>{label}</Text>
          {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
        </View>
      </View>
      <MaterialIcon name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title="More"
        subtitle="Control center & support"
        scrollOffset={scrollOffset}
        showScrollHint
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Control center</Text>
          <Text style={styles.heroTitle}>A calmer More tab</Text>
          <Text style={styles.heroSubtitle}>
            Quickly hop into stats, account controls, or support without distracting animations.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Navigation</Text>
          {primaryLinks.map((item, index) => (
            <Row
              key={item.label}
              icon={item.icon}
              label={item.label}
              description={item.description}
              onPress={item.action}
              isLast={index === primaryLinks.length - 1}
            />
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Support</Text>
          {supportLinks.map((item, index) => (
            <Row
              key={item.label}
              icon={item.icon}
              label={item.label}
              description={item.description}
              onPress={item.action}
              isLast={index === supportLinks.length - 1}
            />
          ))}
        </View>

        <Text style={styles.footnote}>
          Need something else? Ping us anytime — replies are fast.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 16,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.small,
    marginBottom: 16,
  },
  heroEyebrow: {
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: colors.subtleText,
    marginTop: 8,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingBottom: 4,
    marginTop: 18,
  },
  sectionLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  rowDescription: {
    fontSize: 13,
    color: colors.subtleText,
    marginTop: 2,
  },
  footnote: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 20,
  },
});

export default MoreScreen;
