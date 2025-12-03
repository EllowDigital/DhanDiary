import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  Linking,
  NativeSyntheticEvent,
  NativeScrollEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, shadows } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

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

  const heroHighlights = useMemo(
    () => [
      { icon: 'sync', label: 'Offline ready' },
      { icon: 'shield', label: 'Secure sessions' },
      { icon: 'contact-support', label: 'Human support' },
    ],
    []
  );

  const chunkedPrimary = useMemo(() => {
    const chunks: typeof primaryLinks[][] = [];
    for (let i = 0; i < primaryLinks.length; i += 2) {
      chunks.push(primaryLinks.slice(i, i + 2));
    }
    return chunks;
  }, [primaryLinks]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffset(event.nativeEvent.contentOffset.y);
  }, []);

  const Row = ({
    icon,
    label,
    description,
    onPress,
    isLast = false,
    index = 0,
  }: {
    icon: string;
    label: string;
    description?: string;
    onPress: () => void;
    isLast?: boolean;
    index?: number;
  }) => (
    <Animated.View
      entering={FadeInDown.delay(120 + index * 40)
        .springify()
        .damping(18)}
    >
      <Pressable
        onPress={onPress}
        android_ripple={{ color: colors.surfaceMuted }}
        style={({ pressed }) => [
          styles.row,
          pressed && styles.rowPressed,
          isLast && styles.rowLast,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.rowLeft}>
          <View style={styles.iconContainer}>
            <MaterialIcon name={icon as any} size={font(20)} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.rowText}>{label}</Text>
            {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
          </View>
        </View>
        <MaterialIcon name="chevron-right" size={font(22)} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );

  const QuickTile = ({
    icon,
    label,
    description,
    onPress,
    index = 0,
    wrapperStyle,
  }: {
    icon: string;
    label: string;
    description?: string;
    onPress: () => void;
    index?: number;
    wrapperStyle?: StyleProp<ViewStyle>;
  }) => (
    <Animated.View
      style={wrapperStyle}
      entering={FadeInDown.delay(140 + index * 50)
        .springify()
        .damping(18)}
    >
      <Pressable
        onPress={onPress}
        android_ripple={{ color: colors.surfaceMuted }}
        style={({ pressed }) => [styles.quickTile, pressed && styles.quickTilePressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.quickIconBadge}>
          <MaterialIcon name={icon as any} size={font(22)} color={colors.primary} />
        </View>
        <Text style={styles.quickTileLabel}>{label}</Text>
        {description ? <Text style={styles.quickTileDescription}>{description}</Text> : null}
        <View style={styles.quickTileCta}>
          <Text style={styles.quickTileCtaText}>Open</Text>
          <MaterialIcon name="trending-flat" size={font(18)} color={colors.primary} />
        </View>
      </Pressable>
    </Animated.View>
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
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)} style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Control Center</Text>
          <Text style={styles.heroTitle}>Everything you need, now tidy.</Text>
          <Text style={styles.heroSubtitle}>
            Jump into stats, accounts, or preferences without hunting through menus. All the backstage
            tools live here.
          </Text>
          <View style={styles.heroHighlightRow}>
            {heroHighlights.map((item) => (
              <View key={item.label} style={styles.heroHighlight}>
                <MaterialIcon name={item.icon as any} size={font(16)} color={colors.primary} />
                <Text style={styles.heroHighlightText}>{item.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Quick controls</Text>
          {chunkedPrimary.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.quickRow}>
              {row.map((item, colIndex) => (
                <QuickTile
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  onPress={item.action}
                  index={rowIndex * 2 + colIndex}
                  wrapperStyle={[
                    styles.quickTileWrapper,
                    colIndex === 0 && row.length > 1 ? styles.quickTileWrapperSpacing : null,
                  ]}
                />
              ))}
              {row.length === 1 ? <View style={[styles.quickTileWrapper, styles.quickGhost]} /> : null}
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Support & resources</Text>
          {supportLinks.map((item, index) => (
            <Row
              key={item.label}
              icon={item.icon}
              label={item.label}
              description={item.description}
              onPress={item.action}
              isLast={index === supportLinks.length - 1}
              index={index + primaryLinks.length}
            />
          ))}
        </View>
        <Text style={styles.footnote}>
          Need something else? Ping us anytime — we usually reply within a day.
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
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.medium,
    marginBottom: 20,
  },
  heroEyebrow: {
    fontSize: font(12),
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: font(26),
    fontWeight: '700',
    color: colors.text,
    marginTop: 6,
  },
  heroSubtitle: {
    fontSize: font(14),
    color: colors.subtleText,
    marginTop: 10,
    lineHeight: 20,
  },
  heroHighlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  heroHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    marginRight: 10,
    marginBottom: 10,
  },
  heroHighlightText: {
    fontSize: font(12),
    color: colors.text,
    marginLeft: 6,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: font(13),
    color: colors.muted,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },
  quickRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  quickTileWrapper: {
    flex: 1,
  },
  quickTileWrapperSpacing: {
    marginRight: 12,
  },
  quickGhost: {
    opacity: 0,
  },
  quickTile: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 150,
    justifyContent: 'space-between',
  },
  quickTilePressed: {
    backgroundColor: colors.surfaceMuted,
  },
  quickIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickTileLabel: {
    fontSize: font(16),
    color: colors.text,
    fontWeight: '600',
  },
  quickTileDescription: {
    fontSize: font(13),
    color: colors.subtleText,
    marginTop: 4,
    flex: 1,
  },
  quickTileCta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  quickTileCtaText: {
    fontSize: font(13),
    color: colors.primary,
    marginRight: 4,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: font(14),
    paddingHorizontal: font(16),
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
    width: font(38),
    height: font(38),
    borderRadius: font(19),
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: font(16),
  },
  rowText: {
    fontSize: font(16),
    color: colors.text,
    fontWeight: '500',
  },
  rowDescription: {
    fontSize: font(13),
    color: colors.subtleText,
    marginTop: 2,
  },
  footnote: {
    fontSize: font(12),
    color: colors.muted,
    textAlign: 'center',
    marginTop: 24,
  },
});

export default MoreScreen;
