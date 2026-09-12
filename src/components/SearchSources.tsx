import React from 'react';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';

/** Google's supplied Search Suggestions. Scripts and embedded navigation are disabled. */
export function SearchSources({ html }: { html: string }) {
  return <WebView source={{ html }} originWhitelist={['*']} javaScriptEnabled={false}
    style={{ height: 180, backgroundColor: 'transparent' }}
    onShouldStartLoadWithRequest={request => {
      if (request.url === 'about:blank') return true;
      if (request.url.startsWith('https://')) Linking.openURL(request.url).catch(() => {});
      return false;
    }} />;
}
