import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
  Pressable,
  AccessibilityRole,
  ScrollView,
} from 'react-native';
import { Text } from '@rneui/themed';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

type RouteName = 'Settings' | 'About' | 'Account' | 'Stats' | 'AccountManagementScreen' | string;

const MoreScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object>>>();

  const navigateParent = useCallback(
    (route: RouteName) => {
      navigation.navigate(route as any);
    },
    [navigation]
  );

  const Row = ({
    icon,
    label,
    onPress,
    isLast = false,
  }: {
    icon: string;
    label: string;
    onPress: () => void;
    isLast?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#F1F5F9' }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, isLast && styles.rowLast]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.rowLeft}>
        <View style={styles.iconContainer}>
          <MaterialIcon name={icon as any} size={font(22)} color="#3B82F6" />
        </View>
        <Text style={styles.rowText}>{label}</Text>
      </View>
      <MaterialIcon name="chevron-right" size={font(24)} color="#94A3B8" />
    </Pressable>
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>More Options</Text>

      <View style={styles.card}>
        <Row icon="insights" label="Stats & Analytics" onPress={() => navigateParent('Stats')} />
        <Row icon="person" label="Account Management" onPress={() => navigateParent('Account')} />
        <Row icon="settings" label="Settings" onPress={() => navigateParent('Settings')} />
        <Row icon="info-outline" label="About" onPress={() => navigateParent('About')} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerTitle: {
    fontSize: font(28),
    fontWeight: 'bold',
    color: '#1E293B',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F1F5F9',
      },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: font(12),
    paddingHorizontal: font(16),
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowPressed: {
    backgroundColor: '#F8FAFC',
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
    backgroundColor: '#EBF3FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: font(16),
  },
  rowText: {
    fontSize: font(16),
    color: '#1E293B',
    fontWeight: '500',
  },
});

export default MoreScreen;
