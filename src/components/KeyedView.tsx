import React from 'react';
import { View, ViewProps } from 'react-native';

// Enhanced KeyedView: recursively ensures that any element trees (including
// nested fragments/arrays returned by child components) receive stable keys.
// This reduces spurious React warnings originating from third-party libs
// that sometimes return arrays of elements without keys.
const addKeysRecursively = (node: any, prefix = 'k') => {
  if (!React.isValidElement(node)) return node;

  const children = node.props?.children;
  if (!children) {
    // ensure element itself has a key
    if (node.key != null) return node;
    return React.cloneElement(node, { key: prefix });
  }

  // Map children and ensure keys on each
  const mapped = React.Children.map(children, (child: any, idx) => {
    const id = `${prefix}-${idx}`;
    if (React.isValidElement(child)) {
      return addKeysRecursively(child, id);
    }
    return child;
  });

  // clone node with new keyed children and ensure it has a key
  const props: any = { children: mapped };
  if (node.key == null) props.key = prefix;
  return React.cloneElement(node, props);
};

const KeyedView: React.FC<ViewProps> = ({ children, ...rest }) => {
  // Convert top-level children into array and process each entry
  const arr = React.Children.toArray(children);

  let warned = false;
  const processed = arr.map((child: any, idx) => {
    // If it's not an element (string, number), leave it
    if (!React.isValidElement(child)) return child;

    // If child has no key, log once so developers can fix upstream if desired
    if (child.key == null && !warned) {
      const t = child.type
        ? child.type.displayName || child.type.name || String(child.type)
        : 'unknown';

      console.warn(
        `[KeyedView] assigning generated keys to children (first missing at index ${idx}, type=${t})`
      );
      warned = true;
    }

    return addKeysRecursively(child, `keyed-${idx}`);
  });

  return <View {...rest}>{processed}</View>;
};

export default KeyedView;
