import React from 'react';
import { View } from 'react-native';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';

type Props = {
  onPress?: () => void;
  disabled?: boolean;
};

const GoogleAuth: React.FC<Props> = ({ onPress, disabled }) => {
  return (
    <View>
      <GoogleSigninButton
        size={GoogleSigninButton.Size.Wide}
        color={GoogleSigninButton.Color.Dark}
        onPress={onPress}
        disabled={disabled}
      />
    </View>
  );
};

export default GoogleAuth;
