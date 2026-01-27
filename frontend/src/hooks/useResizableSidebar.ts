import { useState, useCallback, useEffect } from 'react'

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 400
const DEFAULT_SIDEBAR_WIDTH = 256

export function useResizableSidebar(options?: {
  minWidth?: number
  maxWidth?: number
  defaultWidth?: number
}) {
  const minWidth = options?.minWidth ?? MIN_SIDEBAR_WIDTH
  const maxWidth = options?.maxWidth ?? MAX_SIDEBAR_WIDTH
  const defaultWidth = options?.defaultWidth ?? DEFAULT_SIDEBAR_WIDTH

  const [sidebarWidth, setSidebarWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const navWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-sidebar-width')) || 56
      const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX - navWidth))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, minWidth, maxWidth])

  return { sidebarWidth, isResizing, handleResizeStart }
}
