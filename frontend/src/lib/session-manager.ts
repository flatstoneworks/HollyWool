/**
 * Generic session manager factory.
 * Creates image or video session managers with backend persistence.
 */

export interface BaseSession {
  id: string
  name: string
  createdAt: string
  thumbnail?: string
  isAutoNamed?: boolean
}

export interface SessionsData<T extends BaseSession> {
  sessions: T[]
  currentSessionId: string | null
}

interface SessionManagerConfig<T extends BaseSession> {
  /** API function to load sessions from backend */
  loadFn: () => Promise<SessionsData<T>>
  /** API function to save sessions to backend */
  saveFn: (data: SessionsData<T>) => Promise<unknown>
  /** Default name prefix for new sessions (e.g. "Session", "Video") */
  namePrefix: string
  /** Factory to create a new session with defaults */
  createDefaults?: () => Partial<T>
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

export function createSessionManager<T extends BaseSession>(config: SessionManagerConfig<T>) {
  let sessionsCache: T[] = []
  let currentSessionIdCache: string | null = null
  let initialized = false

  async function persist(): Promise<void> {
    try {
      await config.saveFn({
        sessions: sessionsCache,
        currentSessionId: currentSessionIdCache,
      })
    } catch (error) {
      console.error('Failed to save sessions to backend:', error)
    }
  }

  async function init(): Promise<SessionsData<T>> {
    try {
      const data = await config.loadFn()
      sessionsCache = data.sessions
      currentSessionIdCache = data.currentSessionId
      initialized = true
      return data
    } catch (error) {
      console.error('Failed to load sessions from backend:', error)
      sessionsCache = []
      currentSessionIdCache = null
      initialized = true
      return { sessions: [], currentSessionId: null }
    }
  }

  function getSessions(): T[] {
    return sessionsCache
  }

  function getCurrentSessionId(): string | null {
    return currentSessionIdCache
  }

  function setCurrentSessionId(id: string): void {
    currentSessionIdCache = id
    persist()
  }

  function createSession(name?: string): T {
    const defaults = config.createDefaults?.() ?? {}
    const session = {
      id: generateId(),
      name: name || `${config.namePrefix} ${sessionsCache.length + 1}`,
      createdAt: new Date().toISOString(),
      ...defaults,
    } as T
    sessionsCache.unshift(session)
    currentSessionIdCache = session.id
    persist()
    return session
  }

  function getSession(id: string): T | undefined {
    return sessionsCache.find(s => s.id === id)
  }

  function updateSession(id: string, updates: Partial<T>): void {
    const index = sessionsCache.findIndex(s => s.id === id)
    if (index !== -1 && sessionsCache[index]) {
      const current = sessionsCache[index]!
      sessionsCache[index] = { ...current, ...updates }
      persist()
    }
  }

  function updateSessionThumbnail(sessionId: string, thumbnail: string): void {
    const session = sessionsCache.find(s => s.id === sessionId)
    if (session) {
      session.thumbnail = thumbnail
      persist()
    }
  }

  function autoRenameSession(sessionId: string, name: string): void {
    const session = sessionsCache.find(s => s.id === sessionId)
    if (session && (session.isAutoNamed !== false)) {
      session.name = name
      session.isAutoNamed = true
      persist()
    }
  }

  function deleteSession(id: string): void {
    sessionsCache = sessionsCache.filter(s => s.id !== id)
    if (currentSessionIdCache === id) {
      if (sessionsCache.length > 0) {
        currentSessionIdCache = sessionsCache[0]!.id
      } else {
        const newSession = createSession()
        currentSessionIdCache = newSession.id
        return
      }
    }
    persist()
  }

  function renameSession(id: string, name: string): void {
    updateSession(id, { name, isAutoNamed: false } as Partial<T>)
  }

  async function ensureCurrentSession(): Promise<T> {
    if (!initialized) {
      await init()
    }
    if (currentSessionIdCache) {
      const session = getSession(currentSessionIdCache)
      if (session) return session
    }
    if (sessionsCache.length > 0) {
      const firstSession = sessionsCache[0]!
      currentSessionIdCache = firstSession.id
      persist()
      return firstSession
    }
    return createSession()
  }

  function isInitialized(): boolean {
    return initialized
  }

  return {
    init,
    getSessions,
    getSession,
    getCurrentSessionId,
    setCurrentSessionId,
    createSession,
    updateSession,
    updateSessionThumbnail,
    autoRenameSession,
    deleteSession,
    renameSession,
    ensureCurrentSession,
    isInitialized,
  }
}
