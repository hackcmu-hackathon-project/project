import React from 'react';
import { ScrollView, View } from 'react-native';
import { colors, radius } from '../theme';
import { T, Touch } from './ui';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * Last line of defence: a render error in one screen shouldn't take the whole
 * app down with a blank screen. Shows what happened and offers a way back.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Rove crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, backgroundColor: colors.bg }}>
        <T s="serif" size={34}>Something broke</T>
        <T s="soft" size={14.5} style={{ marginTop: 10, lineHeight: 21 }}>
          That screen hit an error. Nothing you saved is affected.
        </T>
        <View style={{ marginTop: 18, padding: 14, borderRadius: radius.md, backgroundColor: colors.sunken }}>
          <T size={12} c={colors.muted} style={{ fontFamily: 'monospace' }}>
            {String(this.state.error?.message ?? this.state.error)}
          </T>
        </View>
        <Touch
          onPress={() => this.setState({ error: null })}
          label="Try again"
          style={{ marginTop: 20, padding: 16, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center' }}
        >
          <T s="med" size={15} c="#fff">Try again</T>
        </Touch>
      </ScrollView>
    );
  }
}
