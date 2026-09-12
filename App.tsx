import React, { useState } from 'react';
import { Platform, StatusBar as RNStatusBar, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';

import { colors } from './src/theme';
import { CityKey } from './src/data';
import { AuthProvider, useAuth } from './src/auth';
import { StoreProvider, useStore } from './src/store';
import { TabBar, TabKey } from './src/components/TabBar';
import { Feed } from './src/screens/Feed';
import { Lists } from './src/screens/Lists';
import { Explore } from './src/screens/Explore';
import { Profile } from './src/screens/Profile';
import { Detail } from './src/screens/Detail';
import { Rank } from './src/screens/Rank';
import { SignIn } from './src/screens/SignIn';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { People } from './src/screens/People';
import { Activity } from './src/screens/Activity';
import { Person } from './src/screens/Person';

type Screen = { name: TabKey } | { name: 'detail'; id: number } | { name: 'add'; seedId?: number } | { name: 'people' } | { name: 'activity'; owner: string; itemId: number }
  | { name: 'person'; sub: string };

function Shell() {
  const insets = useSafeAreaInsets();
  const { setCity, refresh } = useStore();
  const [tab, setTab] = useState<TabKey>('feed');
  const [screen, setScreen] = useState<Screen>({ name: 'feed' });
  const [rankKey, setRankKey] = useState(0);

  const top = Math.max(insets.top, Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 24) + 24;
  const openDetail = (id: number) => setScreen({ name: 'detail', id });
  const openActivity = (owner: string, itemId: number) => setScreen({ name: 'activity', owner, itemId });
  const openPerson = (sub: string) => setScreen({ name: 'person', sub });
  const goTab = (t: TabKey) => { setTab(t); setScreen({ name: t }); };
  const startRank = (seedId?: number) => { setRankKey((k) => k + 1); setScreen({ name: 'add', seedId }); };

  let body: React.ReactNode = null;
  if (screen.name === 'detail') {
    body = (
      <Detail
        id={screen.id}
        top={top - 24}
        onClose={() => setScreen({ name: tab })}
        onRank={(id) => startRank(id)}
        onOpenActivity={openActivity}
      />
    );
  } else if (screen.name === 'add') {
    body = <Rank key={rankKey} top={top} seedId={screen.seedId} onFinish={() => goTab('list')} />;
  } else if (screen.name === 'feed') {
    body = (
      <Feed
        top={top}
        onOpenItem={openDetail}
        onOpenActivity={openActivity}
        onOpenPerson={openPerson}
        onFindPeople={() => setScreen({ name: 'people' })}
      />
    );
  } else if (screen.name === 'list') {
    body = <Lists top={top} onOpen={openDetail} onRank={(id) => startRank(id)} />;
  } else if (screen.name === 'person') {
    body = <Person top={top} sub={screen.sub} onClose={() => goTab(tab)} onOpenActivity={openActivity} />;
  } else if (screen.name === 'activity') {
    body = (
      <Activity
        top={top}
        owner={screen.owner}
        itemId={screen.itemId}
        onClose={() => goTab(tab)}
        onOpenItem={openDetail}
        onOpenPerson={openPerson}
      />
    );
  } else if (screen.name === 'people') {
    // Following someone changes the feed, so re-pull on the way out.
    body = <People top={top} onClose={() => { refresh(); goTab('profile'); }} onOpenPerson={openPerson} />;
  } else if (screen.name === 'explore') {
    body = <Explore top={top} onOpen={openDetail} />;
  } else {
    body = (
      <Profile
        top={top}
        onOpenCity={(c: CityKey) => { setCity(c); goTab('list'); }}
        onFindPeople={() => setScreen({ name: 'people' })}
        onOpenPerson={openPerson}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {body}
      {screen.name !== 'detail' ? (
        <TabBar tab={screen.name === 'add' ? ('add' as TabKey) : tab} onTab={goTab} onAdd={() => startRank()} bottom={insets.bottom || 24} />
      ) : null}
    </View>
  );
}

function Gate() {
  const { user } = useAuth();
  if (!user) return <SignIn />;
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

/** On a wide web viewport, present the app inside a phone frame (as in the design). */
function Frame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < 760) return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 402,
          height: 874,
          maxHeight: '94%',
          borderRadius: 54,
          backgroundColor: colors.bg,
          borderWidth: 10,
          borderColor: '#1c1a19',
          overflow: 'hidden',
          shadowColor: '#1c1a19',
          shadowOpacity: 0.25,
          shadowRadius: 60,
          shadowOffset: { width: 0, height: 24 },
        }}
      >
        {children}
        <View style={{ position: 'absolute', top: 10, alignSelf: 'center', width: 120, height: 30, borderRadius: 18, backgroundColor: '#1c1a19' }} />
      </View>
    </View>
  );
}

export default function App() {
  const [loaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
  });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Frame>
        <ErrorBoundary>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </ErrorBoundary>
      </Frame>
    </SafeAreaProvider>
  );
}
