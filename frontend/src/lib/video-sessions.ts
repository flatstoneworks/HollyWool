// Video session management with backend persistence — uses generic session manager
import { api, type VideoSession, type VideoSessionsData } from '@/api/client'
import { createSessionManager } from './session-manager'

export type { VideoSession, VideoSessionsData }
export { generateId } from './session-manager'

const manager = createSessionManager<VideoSession>({
  loadFn: api.getVideoSessions,
  saveFn: api.saveVideoSessions,
  namePrefix: 'Video',
})

// Re-export all manager methods with the original names
export const initVideoSessions = manager.init
export const getVideoSessions = manager.getSessions
export const getVideoSession = manager.getSession
export const getCurrentVideoSessionId = manager.getCurrentSessionId
export const setCurrentVideoSessionId = manager.setCurrentSessionId
export const createVideoSession = manager.createSession
export const updateVideoSession = manager.updateSession
export const updateVideoSessionThumbnail = manager.updateSessionThumbnail
export const autoRenameVideoSession = manager.autoRenameSession
export const deleteVideoSession = manager.deleteSession
export const renameVideoSession = manager.renameSession
export const ensureCurrentVideoSession = manager.ensureCurrentSession
export const isVideoSessionsInitialized = manager.isInitialized
