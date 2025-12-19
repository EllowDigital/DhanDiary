import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from '@rneui/themed';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import GoogleAuth from './google-auth';
import { colors } from '../../utils/design';

type Props = {
  showGoogle?: boolean;
  showGithub?: boolean;
  socialLoading?: boolean;
  onGooglePress?: () => void;
  onGithubPress?: () => void;
};

const FirebaseAuth: React.FC<Props> = ({
  showGoogle,
  showGithub,
  socialLoading,
  onGooglePress,
  onGithubPress,
}) => {
  if (!showGoogle && !showGithub) return null;

  return (
    <View style={styles.socialWrapper}>
      <View style={styles.socialDivider}>
        <View style={styles.socialLine} />
        <Text style={styles.socialText}>or continue with</Text>
        <View style={styles.socialLine} />
      </View>

      <View style={styles.buttonsRow}>
        {showGoogle && (
          <View style={styles.buttonContainer}>
            <GoogleAuth onPress={onGooglePress} disabled={!!socialLoading} />
          </View>
        )}

        {showGithub && (
          <View style={styles.buttonContainer}>
            <Button
              type="outline"
              icon={<FontAwesome name="github" size={18} color={colors.primary} style={{ marginRight: 8 }} />}
              title="GitHub"
              onPress={onGithubPress}
              disabled={!!socialLoading}
              buttonStyle={styles.socialButton}
              titleStyle={styles.socialButtonText}
              containerStyle={{ flex: 1 }}
            />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  socialWrapper: { marginTop: 24 },
  socialDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  socialLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  socialText: { marginHorizontal: 12, fontSize: 12, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  buttonsRow: { flexDirection: 'row', gap: 12 },
  buttonContainer: { flex: 1 },
  socialButton: { borderRadius: 12, borderColor: '#E5E7EB', borderWidth: 1, paddingVertical: 12 },
  socialButtonText: { color: colors.text || '#111827', fontWeight: '600', fontSize: 14 },
});

export default FirebaseAuth;
