// Session management with backend persistence — uses generic session manager
import { api, type Session, type SessionsData } from '@/api/client'
import { createSessionManager } from './session-manager'

export type { Session, SessionsData }
export { generateId } from './session-manager'

const manager = createSessionManager<Session>({
  loadFn: api.getSessions,
  saveFn: api.saveSessions,
  namePrefix: 'Session',
  createDefaults: () => ({ batchIds: [] }) as Partial<Session>,
})

// Re-export all manager methods with the original names
export const initSessions = manager.init
export const getSessions = manager.getSessions
export const getSession = manager.getSession
export const getCurrentSessionId = manager.getCurrentSessionId
export const setCurrentSessionId = manager.setCurrentSessionId
export const createSession = manager.createSession
export const updateSession = manager.updateSession
export const autoRenameSession = manager.autoRenameSession
export const deleteSession = manager.deleteSession
export const renameSession = manager.renameSession
export const ensureCurrentSession = manager.ensureCurrentSession
export const isInitialized = manager.isInitialized

// Image-specific: add a batch ID to a session
export function addBatchToSession(sessionId: string, batchId: string, thumbnail?: string): void {
  const session = manager.getSession(sessionId)
  if (session && !session.batchIds.includes(batchId)) {
    session.batchIds.unshift(batchId)
    if (thumbnail) {
      session.thumbnail = thumbnail
    }
    manager.updateSession(sessionId, { ...session })
  }
}

export function updateSessionThumbnail(sessionId: string, thumbnail: string): void {
  manager.updateSessionThumbnail(sessionId, thumbnail)
}
