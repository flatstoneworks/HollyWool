import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Generic hook for persisting session state (drafts, settings, reference data) to localStorage.
 *
 * Usage:
 * ```ts
 * const {
 *   draft, setDraft,
 *   settings, updateSettings,
 *   refData, setRefData,
 *   saveCurrentSession,
 *   restoreSession,
 *   deleteSessionData,
 * } = useSessionPersistence<MySettings, MyRefData>({
 *   storageKeyPrefix: 'hollywool_image',
 *   currentSessionId: session?.id || null,
 *   defaultSettings: { model: 'sd-turbo', style: 'none' },
 * })
 * ```
 */

export interface UseSessionPersistenceOptions<TSettings, TRefData = string[]> {
  /** Prefix for localStorage keys (e.g., 'hollywool_image' -> 'hollywool_image_drafts') */
  storageKeyPrefix: string
  /** Current session ID (null if no session) */
  currentSessionId: string | null
  /** Default settings for new sessions */
  defaultSettings: TSettings
  /** Default ref data for new sessions */
  defaultRefData?: TRefData
}

export interface SessionPersistenceResult<TSettings, TRefData = string[]> {
  /** Current draft text (prompt) */
  draft: string
  /** Set the current draft */
  setDraft: (value: string) => void

  /** Current settings */
  settings: TSettings
  /** Update settings (partial update) */
  updateSettings: (updates: Partial<TSettings>) => void
  /** Set entire settings object */
  setSettings: (settings: TSettings) => void

  /** Current reference data (e.g., image previews) */
  refData: TRefData
  /** Set reference data */
  setRefData: (data: TRefData) => void

  /** Save current session state (call before switching sessions) */
  saveCurrentSession: () => void
  /** Restore session state (call after switching sessions) */
  restoreSession: (sessionId: string) => { draft: string; settings: TSettings; refData: TRefData }
  /** Delete session data from storage */
  deleteSessionData: (sessionId: string) => void

  /** All session drafts (for debugging) */
  allDrafts: Record<string, string>
  /** All session settings (for debugging) */
  allSettings: Record<string, TSettings>
  /** All session ref data (for debugging) */
  allRefData: Record<string, TRefData>
}

export function useSessionPersistence<TSettings, TRefData = string[]>({
  storageKeyPrefix,
  currentSessionId,
  defaultSettings,
  defaultRefData = [] as unknown as TRefData,
}: UseSessionPersistenceOptions<TSettings, TRefData>): SessionPersistenceResult<TSettings, TRefData> {

  const draftsKey = `${storageKeyPrefix}_drafts`
  const settingsKey = `${storageKeyPrefix}_settings`
  const refDataKey = `${storageKeyPrefix}_ref_data`

  // Load initial state from localStorage
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(draftsKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const [sessionSettings, setSessionSettings] = useState<Record<string, TSettings>>(() => {
    try {
      const saved = localStorage.getItem(settingsKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const [sessionRefData, setSessionRefData] = useState<Record<string, TRefData>>(() => {
    try {
      const saved = localStorage.getItem(refDataKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Current session state
  const [draft, setDraftState] = useState('')
  const [settings, setSettingsState] = useState<TSettings>(defaultSettings)
  const [refData, setRefDataState] = useState<TRefData>(defaultRefData)

  // Track if we've initialized from the current session
  const initializedRef = useRef(false)
  const prevSessionIdRef = useRef<string | null>(null)

  // Persist to localStorage when session data changes
  useEffect(() => {
    localStorage.setItem(draftsKey, JSON.stringify(sessionDrafts))
  }, [sessionDrafts, draftsKey])

  useEffect(() => {
    localStorage.setItem(settingsKey, JSON.stringify(sessionSettings))
  }, [sessionSettings, settingsKey])

  useEffect(() => {
    localStorage.setItem(refDataKey, JSON.stringify(sessionRefData))
  }, [sessionRefData, refDataKey])

  // Save current values to session storage when they change
  useEffect(() => {
    if (currentSessionId) {
      setSessionDrafts(prev => {
        if (prev[currentSessionId] === draft) return prev
        return { ...prev, [currentSessionId]: draft }
      })
    }
  }, [draft, currentSessionId])

  useEffect(() => {
    if (currentSessionId) {
      setSessionSettings(prev => {
        const existing = prev[currentSessionId]
        if (existing && JSON.stringify(existing) === JSON.stringify(settings)) return prev
        return { ...prev, [currentSessionId]: settings }
      })
    }
  }, [settings, currentSessionId])

  useEffect(() => {
    if (currentSessionId) {
      setSessionRefData(prev => {
        const existing = prev[currentSessionId]
        if (existing && JSON.stringify(existing) === JSON.stringify(refData)) return prev
        return { ...prev, [currentSessionId]: refData }
      })
    }
  }, [refData, currentSessionId])

  // Restore session state when session changes
  useEffect(() => {
    if (currentSessionId && currentSessionId !== prevSessionIdRef.current) {
      // Restore from storage
      const savedDraft = sessionDrafts[currentSessionId] || ''
      const savedSettings = sessionSettings[currentSessionId] || defaultSettings
      const savedRefData = sessionRefData[currentSessionId] || defaultRefData

      setDraftState(savedDraft)
      setSettingsState(savedSettings)
      setRefDataState(savedRefData)

      prevSessionIdRef.current = currentSessionId
      initializedRef.current = true
    }
  }, [currentSessionId, sessionDrafts, sessionSettings, sessionRefData, defaultSettings, defaultRefData])

  // Setters
  const setDraft = useCallback((value: string) => {
    setDraftState(value)
  }, [])

  const updateSettings = useCallback((updates: Partial<TSettings>) => {
    setSettingsState(prev => ({ ...prev, ...updates }))
  }, [])

  const setSettings = useCallback((newSettings: TSettings) => {
    setSettingsState(newSettings)
  }, [])

  const setRefData = useCallback((data: TRefData) => {
    setRefDataState(data)
  }, [])

  // Manual save (for when switching sessions)
  const saveCurrentSession = useCallback(() => {
    if (currentSessionId) {
      setSessionDrafts(prev => ({ ...prev, [currentSessionId]: draft }))
      setSessionSettings(prev => ({ ...prev, [currentSessionId]: settings }))
      setSessionRefData(prev => ({ ...prev, [currentSessionId]: refData }))
    }
  }, [currentSessionId, draft, settings, refData])

  // Manual restore (for when switching sessions)
  const restoreSession = useCallback((sessionId: string) => {
    const savedDraft = sessionDrafts[sessionId] || ''
    const savedSettings = sessionSettings[sessionId] || defaultSettings
    const savedRefData = sessionRefData[sessionId] || defaultRefData

    return { draft: savedDraft, settings: savedSettings, refData: savedRefData }
  }, [sessionDrafts, sessionSettings, sessionRefData, defaultSettings, defaultRefData])

  // Delete session data
  const deleteSessionData = useCallback((sessionId: string) => {
    setSessionDrafts(prev => {
      const updated = { ...prev }
      delete updated[sessionId]
      return updated
    })
    setSessionSettings(prev => {
      const updated = { ...prev }
      delete updated[sessionId]
      return updated
    })
    setSessionRefData(prev => {
      const updated = { ...prev }
      delete updated[sessionId]
      return updated
    })
  }, [])

  return {
    draft,
    setDraft,
    settings,
    updateSettings,
    setSettings,
    refData,
    setRefData,
    saveCurrentSession,
    restoreSession,
    deleteSessionData,
    allDrafts: sessionDrafts,
    allSettings: sessionSettings,
    allRefData: sessionRefData,
  }
}
