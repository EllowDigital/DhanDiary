import React, { forwardRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing } from '../utils/design';

export type AuthFieldProps = TextInputProps & {
  icon: React.ComponentProps<typeof MaterialIcon>['name'];
  error?: string | null;
  rightAccessory?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
};

/**
 * Shared text input used on auth screens so touch targets stay large and consistent.
 */
const AuthField = forwardRef<TextInput, AuthFieldProps>(
  ({ icon, error, rightAccessory, containerStyle, inputStyle, ...rest }, ref) => {
    return (
      <View style={[styles.wrapper, containerStyle]}>
        <View style={styles.field}>
          <MaterialIcon name={icon} size={22} color={colors.muted} />
          <TextInput
            ref={ref}
            style={[styles.input, inputStyle]}
            placeholderTextColor={colors.muted}
            {...rest}
          />
          {rightAccessory ? <View style={styles.accessory}>{rightAccessory}</View> : null}
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }
);

export default AuthField;

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginTop: spacing(1.5),
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(1.25),
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    marginLeft: spacing(1),
    fontSize: 16,
    color: colors.text,
  },
  accessory: {
    marginLeft: spacing(1),
    flexDirection: 'row',
    alignItems: 'center',
  },
  error: {
    marginTop: spacing(0.5),
    marginLeft: spacing(0.5),
    color: colors.accentRed,
    fontSize: 12,
    fontWeight: '600',
  },
});
