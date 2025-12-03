import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing } from '../utils/design';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  showScrollHint?: boolean;
  scrollOffset?: number;
  scrollHintThreshold?: number;
  onDismissScrollHint?: () => void;
  style?: StyleProp<ViewStyle>;
};

const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  rightSlot,
  showScrollHint = true,
  scrollOffset,
  scrollHintThreshold = spacing(4),
  onDismissScrollHint,
  style,
}) => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const canGoBack = navigation.canGoBack();
  const [hintVisible, setHintVisible] = useState(showScrollHint);

  const handleNav = () => {
    if (canGoBack) {
      navigation.goBack();
    } else if (typeof navigation.openDrawer === 'function') {
      navigation.openDrawer();
    } else if (typeof navigation.toggleDrawer === 'function') {
      navigation.toggleDrawer();
    }
  };

  useEffect(() => {
    setHintVisible(showScrollHint);
  }, [showScrollHint]);

  useEffect(() => {
    if (!hintVisible) {
      return;
    }
    if (typeof scrollOffset === 'number' && scrollOffset > scrollHintThreshold) {
      setHintVisible(false);
      onDismissScrollHint?.();
    }
  }, [hintVisible, onDismissScrollHint, scrollHintThreshold, scrollOffset]);

  const handleDismissHint = () => {
    if (!hintVisible) {
      return;
    }
    setHintVisible(false);
    onDismissScrollHint?.();
  };

  return (
    <View
      style={[styles.wrapper, { paddingTop: insets.top + spacing(1) }, style]}
      accessibilityRole="header"
      accessibilityLabel={`${title} header`}
    >
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleNav}
          accessibilityRole="button"
          accessibilityLabel={canGoBack ? 'Go back' : 'Open navigation menu'}
        >
          <MaterialIcon name={canGoBack ? 'arrow-back' : 'menu'} size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {rightSlot ? (
          <View style={styles.rightSlot}>{rightSlot}</View>
        ) : (
          <View style={styles.rightSpacer} />
        )}
      </View>
      {hintVisible && (
        <TouchableOpacity
          style={styles.scrollHint}
          onPress={handleDismissHint}
          accessibilityRole="button"
          accessibilityLabel="Dismiss scroll hint"
        >
          <MaterialIcon name="swipe-down" size={16} color={colors.muted} />
          <Text style={styles.scrollHintText}>Scroll for more</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing(2),
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  titleWrap: {
    flex: 1,
    marginHorizontal: spacing(1.5),
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
  },
  rightSlot: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  rightSpacer: {
    width: 44,
  },
  scrollHint: {
    marginTop: spacing(1),
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing(1),
    paddingVertical: spacing(0.5),
    borderRadius: spacing(2),
    backgroundColor: colors.surfaceMuted,
  },
  scrollHintText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: spacing(0.5),
  },
});

export default ScreenHeader;
