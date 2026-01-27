export type ModelProvider = 'krea' | 'higgsfield' | 'fal' | 'anthropic'

export interface ProviderPreset {
  name: string
  description: string
  website?: string
  capabilities: ('image' | 'video' | 'llm')[]
  category?: 'image' | 'llm'
  envVar: string
}

export interface PreviewModel {
  id: string
  name: string
  description: string
  type: 'image' | 'video'
  tags?: string[]
}

export const PROVIDER_PRESETS: Record<ModelProvider, ProviderPreset> = {
  krea: {
    name: 'KREA',
    description: 'Image and video generation via FLUX, Nano Banana Pro, Kling and more',
    website: 'https://krea.ai',
    capabilities: ['image', 'video'],
    envVar: 'KREA_API_TOKEN',
  },
  higgsfield: {
    name: 'Higgsfield',
    description: 'High-quality video generation',
    website: 'https://higgsfield.ai',
    capabilities: ['video'],
    envVar: 'HIGGSFIELD_API_KEY',
  },
  fal: {
    name: 'fal.ai',
    description: 'Fast inference for generative AI models',
    website: 'https://fal.ai',
    capabilities: ['image', 'video'],
    envVar: 'FAL_KEY',
  },
  anthropic: {
    name: 'Anthropic',
    description: 'Claude AI for prompt generation and LLM tasks',
    website: 'https://console.anthropic.com',
    capabilities: ['llm'],
    category: 'llm',
    envVar: 'ANTHROPIC_API_KEY',
  },
}

export const PREVIEW_MODELS: Record<ModelProvider, PreviewModel[]> = {
  krea: [
    {
      id: 'krea-nano-banana-pro',
      name: 'Nano Banana Pro',
      description: 'Google Gemini 3 Pro Image via Krea. Supports structured prompts for precise control.',
      type: 'image',
      tags: ['nano-banana', 'gemini', '4k'],
    },
    {
      id: 'krea-nano-banana',
      name: 'Nano Banana',
      description: 'Google Gemini 2.5 Flash Image via Krea. Faster and more cost-effective.',
      type: 'image',
      tags: ['nano-banana', 'fast'],
    },
    {
      id: 'krea-flux-dev',
      name: 'FLUX.1 [dev] via Krea',
      description: 'High-quality image generation with FLUX.1 dev model through Krea API.',
      type: 'image',
      tags: ['flux', 'quality'],
    },
    {
      id: 'krea-kling-video',
      name: 'Kling Video',
      description: 'Video generation powered by Kling through Krea API.',
      type: 'video',
      tags: ['kling', 'video'],
    },
  ],
  higgsfield: [
    {
      id: 'higgsfield-video',
      name: 'Higgsfield Video',
      description: 'High-quality video generation with Higgsfield AI.',
      type: 'video',
      tags: ['video', 'quality'],
    },
  ],
  fal: [
    {
      id: 'fal-flux-dev',
      name: 'FLUX.1 [dev]',
      description: 'High-quality image generation with FLUX.1 dev model via fal.ai.',
      type: 'image',
      tags: ['flux', 'quality'],
    },
    {
      id: 'fal-flux-schnell',
      name: 'FLUX.1 [schnell]',
      description: 'Fast image generation with FLUX.1 schnell model via fal.ai.',
      type: 'image',
      tags: ['flux', 'fast'],
    },
    {
      id: 'fal-luma-dream-machine',
      name: 'Luma Dream Machine',
      description: 'Video generation with Luma Dream Machine via fal.ai.',
      type: 'video',
      tags: ['luma', 'video'],
    },
  ],
  anthropic: [],
}
