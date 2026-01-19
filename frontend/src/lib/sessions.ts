// Session management with backend persistence
import { api, type Session, type SessionsData } from '@/api/client'

export type { Session, SessionsData }

// Local cache
let sessionsCache: Session[] = []
let currentSessionIdCache: string | null = null
let initialized = false

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

// Initialize sessions from backend
export async function initSessions(): Promise<SessionsData> {
  try {
    const data = await api.getSessions()
    sessionsCache = data.sessions
    currentSessionIdCache = data.currentSessionId
    initialized = true
    return data
  } catch (error) {
    console.error('Failed to load sessions from backend:', error)
    // Return empty data on error
    sessionsCache = []
    currentSessionIdCache = null
    initialized = true
    return { sessions: [], currentSessionId: null }
  }
}

// Save sessions to backend
async function persistSessions(): Promise<void> {
  try {
    await api.saveSessions({
      sessions: sessionsCache,
      currentSessionId: currentSessionIdCache,
    })
  } catch (error) {
    console.error('Failed to save sessions to backend:', error)
  }
}

export function getSessions(): Session[] {
  return sessionsCache
}

export function getCurrentSessionId(): string | null {
  return currentSessionIdCache
}

export function setCurrentSessionId(id: string): void {
  currentSessionIdCache = id
  persistSessions()
}

export function createSession(name?: string): Session {
  const session: Session = {
    id: generateId(),
    name: name || `Session ${sessionsCache.length + 1}`,
    createdAt: new Date().toISOString(),
    batchIds: [],
  }
  sessionsCache.unshift(session) // Add to beginning
  currentSessionIdCache = session.id
  persistSessions()
  return session
}

export function getSession(id: string): Session | undefined {
  return sessionsCache.find(s => s.id === id)
}

export function updateSession(id: string, updates: Partial<Session>): void {
  const index = sessionsCache.findIndex(s => s.id === id)
  if (index !== -1 && sessionsCache[index]) {
    const current = sessionsCache[index]!
    sessionsCache[index] = { ...current, ...updates }
    persistSessions()
  }
}

export function addBatchToSession(sessionId: string, batchId: string, thumbnail?: string): void {
  const session = sessionsCache.find(s => s.id === sessionId)
  if (session && !session.batchIds.includes(batchId)) {
    session.batchIds.unshift(batchId) // Add to beginning (newest first)
    if (thumbnail) {
      session.thumbnail = thumbnail
    }
    persistSessions()
  }
}

export function updateSessionThumbnail(sessionId: string, thumbnail: string): void {
  const session = sessionsCache.find(s => s.id === sessionId)
  if (session) {
    session.thumbnail = thumbnail
    persistSessions()
  }
}

export function autoRenameSession(sessionId: string, name: string): void {
  const session = sessionsCache.find(s => s.id === sessionId)
  // Only auto-rename if the session hasn't been manually renamed
  if (session && (session.isAutoNamed !== false)) {
    session.name = name
    session.isAutoNamed = true
    persistSessions()
  }
}

export function deleteSession(id: string): void {
  sessionsCache = sessionsCache.filter(s => s.id !== id)

  // If deleted current session, switch to another or create new
  if (currentSessionIdCache === id) {
    if (sessionsCache.length > 0) {
      currentSessionIdCache = sessionsCache[0]!.id
    } else {
      const newSession = createSession()
      currentSessionIdCache = newSession.id
      return // createSession already persists
    }
  }
  persistSessions()
}

export function renameSession(id: string, name: string): void {
  updateSession(id, { name, isAutoNamed: false }) // Mark as manually renamed
}

// Get or create a current session
export async function ensureCurrentSession(): Promise<Session> {
  if (!initialized) {
    await initSessions()
  }

  // Try to use the current session from backend
  if (currentSessionIdCache) {
    const session = getSession(currentSessionIdCache)
    if (session) return session
  }

  // If currentSessionId doesn't match but we have sessions, use the first one
  // This prevents overwriting existing sessions when a new browser connects
  if (sessionsCache.length > 0) {
    const firstSession = sessionsCache[0]!
    currentSessionIdCache = firstSession.id
    // Only persist if we're changing the current session ID
    persistSessions()
    return firstSession
  }

  // Only create a new session if there are truly NO sessions
  return createSession()
}

// Check if sessions are initialized
export function isInitialized(): boolean {
  return initialized
}
