import React, { createContext, useContext, useState } from 'react';
import { AgentReply, AgentTurn, SavedTrip } from './api';

export type Entry = AgentTurn & { places?: AgentReply['places']; trip?: SavedTrip | null };

type Ctx = { entries: Entry[]; setEntries: React.Dispatch<React.SetStateAction<Entry[]>> };
const C = createContext<Ctx>(null as any);

/**
 * The transcript lives above the screen so that opening a place or a trip the
 * assistant suggested — and coming back — doesn't throw the conversation away.
 */
export function AgentChatProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  return <C.Provider value={{ entries, setEntries }}>{children}</C.Provider>;
}

export const useAgentChat = () => useContext(C);
