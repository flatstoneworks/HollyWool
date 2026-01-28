// Bulk session management with backend persistence — uses generic session manager
import { api, type BulkSession, type BulkSessionsData } from '@/api/client'
import { createSessionManager } from './session-manager'

export type { BulkSession, BulkSessionsData }
export { generateId } from './session-manager'

const manager = createSessionManager<BulkSession>({
  loadFn: api.getBulkSessions,
  saveFn: api.saveBulkSessions,
  namePrefix: 'Bulk',
  createDefaults: () => ({ bulkJobIds: [] }) as Partial<BulkSession>,
})

// Re-export all manager methods
export const initBulkSessions = manager.init
export const getBulkSessions = manager.getSessions
export const getBulkSession = manager.getSession
export const getCurrentBulkSessionId = manager.getCurrentSessionId
export const setCurrentBulkSessionId = manager.setCurrentSessionId
export const createBulkSession = manager.createSession
export const updateBulkSession = manager.updateSession
export const updateBulkSessionThumbnail = manager.updateSessionThumbnail
export const autoRenameBulkSession = manager.autoRenameSession
export const deleteBulkSession = manager.deleteSession
export const renameBulkSession = manager.renameSession
export const ensureCurrentBulkSession = manager.ensureCurrentSession
export const isBulkSessionsInitialized = manager.isInitialized

// Bulk-specific: add a bulk job ID to a session
export function addBulkJobToSession(sessionId: string, bulkJobId: string, thumbnail?: string): void {
  const session = manager.getSession(sessionId)
  if (session && !session.bulkJobIds.includes(bulkJobId)) {
    session.bulkJobIds.unshift(bulkJobId)
    if (thumbnail) {
      session.thumbnail = thumbnail
    }
    manager.updateSession(sessionId, { ...session })
  }
}
