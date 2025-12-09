import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Text as RNText,
} from 'react-native';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton } from 'react-native-gesture-handler';
import dayjs from 'dayjs';
import AppCard from './AppCard';
import { ensureCategory } from '../constants/categories';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

type Props = {
  item: any;
  onEdit?: (item: any) => void;
  onDelete?: (local_id: string) => void;
};

const TransactionCardInner: React.FC<Props> = ({ item, onEdit, onDelete }) => {
  const anim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
    }).start();
  }, []);

  // LEFT ACTION (Edit)
  const renderLeftActions = () => (
    <RectButton
      style={[styles.swipeAction, { backgroundColor: '#1E88E5' }]}
      onPress={() => onEdit?.(item)}
    >
      <MaterialIcon name="edit" size={24} color="#fff" />
      <RNText style={styles.swipeText}>Edit</RNText>
    </RectButton>
  );

  // RIGHT ACTION (Delete)
  const renderRightActions = () => (
    <RectButton
      style={[styles.swipeAction, { backgroundColor: '#D32F2F' }]}
      onPress={() => onDelete?.(item.local_id)}
    >
      <MaterialIcon name="delete" size={24} color="#fff" />
      <RNText style={styles.swipeText}>Delete</RNText>
    </RectButton>
  );

  return (
    <Swipeable
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
    >
      <Animated.View style={{ transform: [{ scale: anim }] }}>
        <AppCard style={styles.card}>
          <View style={styles.row}>
            {/* ICON */}
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: item.type === 'in' ? '#E8F5E9' : '#FDECEA' },
              ]}
            >
              <MaterialIcon
                name={item.type === 'in' ? 'arrow-downward' : 'arrow-upward'}
                size={26}
                color={item.type === 'in' ? '#2E7D32' : '#C62828'}
              />
            </View>

            {/* MAIN CONTENT */}
            <View style={styles.middleContent}>
              <Text style={styles.categoryText}>{ensureCategory(item.category)}</Text>
              <Text style={styles.noteText}>{item.note || 'No description'}</Text>
            </View>

            {/* RIGHT SIDE */}
            <View style={styles.rightSide}>
              <Text
                style={[
                  styles.amountText,
                  {
                    color: item.type === 'in' ? '#2E7D32' : '#C62828',
                  },
                ]}
              >
                {item.type === 'in' ? '+' : '-'}₹{Number(item.amount).toFixed(2)}
              </Text>

              <RNText style={styles.dateText}>
                {(() => {
                  const d = dayjs(item.date || item.created_at);
                  return d.isValid() ? d.format('DD MMM YYYY') : '—';
                })()}
              </RNText>

              {/* ACTION ICONS: Only show if handlers are provided */}
              {(onEdit || onDelete) && (
                <View style={styles.actionsRow}>
                  {onEdit && (
                    <TouchableOpacity onPress={() => onEdit(item)} style={styles.iconButton}>
                      <MaterialIcon name="edit" size={18} color="#444" />
                    </TouchableOpacity>
                  )}
                  {onDelete && (
                    <TouchableOpacity
                      onPress={() => onDelete(item.local_id)}
                      style={[styles.iconButton, { marginLeft: 12 }]}
                    >
                      <MaterialIcon name="delete" size={18} color="#D32F2F" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        </AppCard>
      </Animated.View>
    </Swipeable>
  );
};

const TransactionCard = React.memo(TransactionCardInner, (prev, next) => {
  // shallow compare item id and a few stable props to avoid unnecessary re-renders
  try {
    if (prev.item && next.item) {
      if (prev.item.local_id !== next.item.local_id) return false;
      if (prev.item.amount !== next.item.amount) return false;
      if (prev.item.updated_at !== next.item.updated_at) return false;
      if (prev.item.type !== next.item.type) return false;
    }
  } catch (e) {}
  // assume handlers stable (caller should memoize) — otherwise re-render
  return prev.onEdit === next.onEdit && prev.onDelete === next.onDelete;
});

export default TransactionCard;

/* ------------------------------------
               STYLES
-------------------------------------*/
const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 8,
    paddingVertical: 12,
    borderRadius: 16,

    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  middleContent: {
    flex: 1,
  },

  categoryText: {
    fontSize: font(15),
    fontWeight: '700',
    color: '#1E293B',
  },

  noteText: {
    marginTop: 4,
    fontSize: font(13),
    color: '#6B7280',
  },

  rightSide: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  amountText: {
    fontWeight: '700',
    fontSize: font(15),
  },

  dateText: {
    fontSize: font(12),
    color: '#94A3B8',
    marginTop: 6,
  },

  actionsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },

  iconButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },

  swipeAction: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },

  swipeText: {
    color: '#fff',
    marginTop: 4,
    fontSize: 12,
  },
});
