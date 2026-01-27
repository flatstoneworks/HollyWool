export type ModelProvider = string

export interface ProviderPreset {
  name: string
}

export interface PreviewModel {
  id: string
  name: string
  description: string
  type: 'image' | 'video'
}

export const PROVIDER_PRESETS: Record<ModelProvider, ProviderPreset> = {}

export const PREVIEW_MODELS: Record<ModelProvider, PreviewModel[]> = {}
