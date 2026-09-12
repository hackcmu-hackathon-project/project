import React from 'react';

export function SearchSources({ html }: { html: string }) {
  return <iframe title="Google Search suggestions" srcDoc={html}
    sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer"
    style={{ width: '100%', height: 180, border: 0 }} />;
}
