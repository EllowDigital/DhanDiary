import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button } from '@rneui/themed';

type Props = {
  buttons: string[];
  selectedIndex?: number;
  onPress?: (i: number) => void;
  containerStyle?: any;
  selectedButtonStyle?: any;
};

const SimpleButtonGroup = ({
  buttons,
  selectedIndex = 0,
  onPress,
  containerStyle,
  selectedButtonStyle,
}: Props) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {buttons.map((b, i) => (
        <Button
          key={`${b}-${i}`}
          title={b}
          type={i === selectedIndex ? 'solid' : 'outline'}
          onPress={() => onPress && onPress(i)}
          buttonStyle={i === selectedIndex ? selectedButtonStyle : undefined}
          containerStyle={{ flex: 1, marginHorizontal: 4 }}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default SimpleButtonGroup;
