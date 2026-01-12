// Video session management - separate from image sessions
// Uses localStorage since video generation backend is not yet implemented

export interface VideoSession {
  id: string
  name: string
  createdAt: string
  thumbnail?: string
  isAutoNamed?: boolean
}

const STORAGE_KEY = 'hollywool_video_sessions'
const CURRENT_SESSION_KEY = 'hollywool_video_current_session'

// Local cache
let sessionsCache: VideoSession[] = []
let currentSessionIdCache: string | null = null
let initialized = false

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

// Load from localStorage
function loadFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    sessionsCache = stored ? JSON.parse(stored) : []
    currentSessionIdCache = localStorage.getItem(CURRENT_SESSION_KEY)
  } catch (error) {
    console.error('Failed to load video sessions:', error)
    sessionsCache = []
    currentSessionIdCache = null
  }
  initialized = true
}

// Save to localStorage
function persistSessions(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsCache))
    if (currentSessionIdCache) {
      localStorage.setItem(CURRENT_SESSION_KEY, currentSessionIdCache)
    } else {
      localStorage.removeItem(CURRENT_SESSION_KEY)
    }
  } catch (error) {
    console.error('Failed to save video sessions:', error)
  }
}

export function getVideoSessions(): VideoSession[] {
  if (!initialized) loadFromStorage()
  return sessionsCache
}

export function getCurrentVideoSessionId(): string | null {
  if (!initialized) loadFromStorage()
  return currentSessionIdCache
}

export function setCurrentVideoSessionId(id: string): void {
  currentSessionIdCache = id
  persistSessions()
}

export function createVideoSession(name?: string): VideoSession {
  if (!initialized) loadFromStorage()

  const session: VideoSession = {
    id: generateId(),
    name: name || `Video ${sessionsCache.length + 1}`,
    createdAt: new Date().toISOString(),
  }
  sessionsCache.unshift(session)
  currentSessionIdCache = session.id
  persistSessions()
  return session
}

export function getVideoSession(id: string): VideoSession | undefined {
  if (!initialized) loadFromStorage()
  return sessionsCache.find(s => s.id === id)
}

export function updateVideoSession(id: string, updates: Partial<VideoSession>): void {
  if (!initialized) loadFromStorage()

  const index = sessionsCache.findIndex(s => s.id === id)
  if (index !== -1 && sessionsCache[index]) {
    const current = sessionsCache[index]!
    sessionsCache[index] = { ...current, ...updates }
    persistSessions()
  }
}

export function deleteVideoSession(id: string): void {
  if (!initialized) loadFromStorage()

  sessionsCache = sessionsCache.filter(s => s.id !== id)

  if (currentSessionIdCache === id) {
    if (sessionsCache.length > 0) {
      currentSessionIdCache = sessionsCache[0]!.id
    } else {
      const newSession = createVideoSession()
      currentSessionIdCache = newSession.id
      return
    }
  }
  persistSessions()
}

export function renameVideoSession(id: string, name: string): void {
  updateVideoSession(id, { name, isAutoNamed: false })
}

export function ensureCurrentVideoSession(): VideoSession {
  if (!initialized) loadFromStorage()

  if (currentSessionIdCache) {
    const session = getVideoSession(currentSessionIdCache)
    if (session) return session
  }
  return createVideoSession()
}

export function isVideoSessionsInitialized(): boolean {
  return initialized
}
