import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type AppSettings } from '@/api/client'

/**
 * Shared favorites hook with optimistic updates.
 *
 * Usage:
 *   const { favorites, isFavorited, toggle } = useFavorites()
 *   toggle('model-id')             // local model
 *   toggle('civitai:123')          // civitai model
 *   toggle('krea:flux-dev')        // remote model
 */
export function useFavorites() {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  })

  const favorites = settings?.favorite_models ?? []

  const toggleMutation = useMutation({
    mutationFn: api.toggleFavorite,
    meta: { errorMessage: 'Failed to update favorite' },
    onMutate: async (modelId: string) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const prev = queryClient.getQueryData<AppSettings>(['settings'])
      if (prev) {
        const favs = prev.favorite_models || []
        const idx = favs.indexOf(modelId)
        const updated = idx >= 0 ? favs.filter((id) => id !== modelId) : [...favs, modelId]
        queryClient.setQueryData(['settings'], { ...prev, favorite_models: updated })
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['settings'], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const isFavorited = (modelId: string) => favorites.includes(modelId)
  const toggle = (modelId: string) => toggleMutation.mutate(modelId)

  return { favorites, isFavorited, toggle }
}

/**
 * Convenience hook for a single model's favorite state.
 *
 * Usage:
 *   const { isFavorited, toggle } = useFavorite('model-id')
 *   const { isFavorited, toggle } = useFavorite(`civitai:${versionId}`)
 */
export function useFavorite(favoriteId: string | undefined) {
  const { isFavorited: checkFavorited, toggle: doToggle } = useFavorites()

  const isFavorited = favoriteId ? checkFavorited(favoriteId) : false
  const toggle = () => { if (favoriteId) doToggle(favoriteId) }

  return { isFavorited, toggle }
}
