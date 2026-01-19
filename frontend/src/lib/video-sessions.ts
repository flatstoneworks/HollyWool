// Video session management with backend persistence
import { api, type VideoSession, type VideoSessionsData } from '@/api/client'

export type { VideoSession, VideoSessionsData }

// Local cache
let sessionsCache: VideoSession[] = []
let currentSessionIdCache: string | null = null
let initialized = false

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

// Initialize video sessions from backend
export async function initVideoSessions(): Promise<VideoSessionsData> {
  try {
    const data = await api.getVideoSessions()
    sessionsCache = data.sessions
    currentSessionIdCache = data.currentSessionId
    initialized = true
    return data
  } catch (error) {
    console.error('Failed to load video sessions from backend:', error)
    // Return empty data on error
    sessionsCache = []
    currentSessionIdCache = null
    initialized = true
    return { sessions: [], currentSessionId: null }
  }
}

// Save video sessions to backend
async function persistSessions(): Promise<void> {
  try {
    await api.saveVideoSessions({
      sessions: sessionsCache,
      currentSessionId: currentSessionIdCache,
    })
  } catch (error) {
    console.error('Failed to save video sessions to backend:', error)
  }
}

export function getVideoSessions(): VideoSession[] {
  return sessionsCache
}

export function getCurrentVideoSessionId(): string | null {
  return currentSessionIdCache
}

export function setCurrentVideoSessionId(id: string): void {
  currentSessionIdCache = id
  persistSessions()
}

export function createVideoSession(name?: string): VideoSession {
  const session: VideoSession = {
    id: generateId(),
    name: name || `Video ${sessionsCache.length + 1}`,
    createdAt: new Date().toISOString(),
  }
  sessionsCache.unshift(session) // Add to beginning
  currentSessionIdCache = session.id
  persistSessions()
  return session
}

export function getVideoSession(id: string): VideoSession | undefined {
  return sessionsCache.find(s => s.id === id)
}

export function updateVideoSession(id: string, updates: Partial<VideoSession>): void {
  const index = sessionsCache.findIndex(s => s.id === id)
  if (index !== -1 && sessionsCache[index]) {
    const current = sessionsCache[index]!
    sessionsCache[index] = { ...current, ...updates }
    persistSessions()
  }
}

export function updateVideoSessionThumbnail(sessionId: string, thumbnail: string): void {
  const session = sessionsCache.find(s => s.id === sessionId)
  if (session) {
    session.thumbnail = thumbnail
    persistSessions()
  }
}

export function autoRenameVideoSession(sessionId: string, name: string): void {
  const session = sessionsCache.find(s => s.id === sessionId)
  // Only auto-rename if the session hasn't been manually renamed
  if (session && (session.isAutoNamed !== false)) {
    session.name = name
    session.isAutoNamed = true
    persistSessions()
  }
}

export function deleteVideoSession(id: string): void {
  sessionsCache = sessionsCache.filter(s => s.id !== id)

  // If deleted current session, switch to another or create new
  if (currentSessionIdCache === id) {
    if (sessionsCache.length > 0) {
      currentSessionIdCache = sessionsCache[0]!.id
    } else {
      const newSession = createVideoSession()
      currentSessionIdCache = newSession.id
      return // createVideoSession already persists
    }
  }
  persistSessions()
}

export function renameVideoSession(id: string, name: string): void {
  updateVideoSession(id, { name, isAutoNamed: false }) // Mark as manually renamed
}

// Get or create a current video session
export async function ensureCurrentVideoSession(): Promise<VideoSession> {
  if (!initialized) {
    await initVideoSessions()
  }

  // Try to use the current session from backend
  if (currentSessionIdCache) {
    const session = getVideoSession(currentSessionIdCache)
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
  return createVideoSession()
}

// Check if video sessions are initialized
export function isVideoSessionsInitialized(): boolean {
  return initialized
}
