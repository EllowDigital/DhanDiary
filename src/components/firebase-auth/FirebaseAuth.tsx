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

  // Feature-detect provider availability so we can disable buttons with helpful messages
  let googleAvailable = true;
  let githubAvailable = true;
  try {
    const googleMod: any = require('../../services/googleAuth');
    googleAvailable = typeof googleMod.isGoogleConfigured === 'function' ? googleMod.isGoogleConfigured() : true;
  } catch (e) {
    googleAvailable = false;
  }
  try {
    const gh: any = require('../../services/githubAuth');
    githubAvailable = typeof gh.isGithubConfigured === 'function' ? gh.isGithubConfigured() : true;
  } catch (e) {
    githubAvailable = false;
  }

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
            <GoogleAuth
              onPress={() => {
                if (!googleAvailable) {
                  // Show helpful message
                  try {
                    const { Alert } = require('react-native');
                    Alert.alert(
                      'Google Sign-In Unavailable',
                      'Google Sign-In is not configured for this build. Use a dev-client/native build or set the Google Web client id in app config.'
                    );
                  } catch (e) {}
                  return;
                }
                if (onGooglePress) onGooglePress();
              }}
              disabled={!!socialLoading || !googleAvailable}
            />
          </View>
        )}

        {showGithub && (
          <View style={styles.buttonContainer}>
            <Button
              type="outline"
              icon={
                <FontAwesome
                  name="github"
                  size={18}
                  color={colors.primary}
                  style={{ marginRight: 8 }}
                />
              }
              title="GitHub"
              onPress={() => {
                if (!githubAvailable) {
                  try {
                    const { Alert } = require('react-native');
                    Alert.alert(
                      'GitHub Sign-In Unavailable',
                      'GitHub Sign-In is not configured in this build. Provide EXPO_PUBLIC_GITHUB_CLIENT_ID in app config or configure a server-side exchange.'
                    );
                  } catch (e) {}
                  return;
                }
                if (onGithubPress) onGithubPress();
              }}
              disabled={!!socialLoading || !githubAvailable}
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
  socialText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  buttonsRow: { flexDirection: 'row', gap: 12 },
  buttonContainer: { flex: 1 },
  socialButton: { borderRadius: 12, borderColor: '#E5E7EB', borderWidth: 1, paddingVertical: 12 },
  socialButtonText: { color: colors.text || '#111827', fontWeight: '600', fontSize: 14 },
});

export default FirebaseAuth;
