import { useState } from 'react'
import type { ComfyUIEditableParameter } from '@/api/client'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface WorkflowParameterFormProps {
  parameters: ComfyUIEditableParameter[]
  values: Record<string, string | number>
  onChange: (values: Record<string, string | number>) => void
  disabled?: boolean
}

// Category labels and order
const CATEGORY_CONFIG: Record<string, { label: string; order: number }> = {
  prompt: { label: 'Prompts', order: 0 },
  sampler: { label: 'Sampler', order: 1 },
  dimensions: { label: 'Dimensions', order: 2 },
  model: { label: 'Model', order: 3 },
  advanced: { label: 'Advanced', order: 4 },
}

export function WorkflowParameterForm({
  parameters,
  values,
  onChange,
  disabled = false,
}: WorkflowParameterFormProps) {
  // Group parameters by category
  const groupedParams = parameters.reduce((acc, param) => {
    const category = param.category || 'advanced'
    if (!acc[category]) acc[category] = []
    acc[category].push(param)
    return acc
  }, {} as Record<string, ComfyUIEditableParameter[]>)

  // Sort categories
  const sortedCategories = Object.keys(groupedParams).sort(
    (a, b) => (CATEGORY_CONFIG[a]?.order ?? 99) - (CATEGORY_CONFIG[b]?.order ?? 99)
  )

  // Track collapsed state for each category
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    advanced: true, // Advanced collapsed by default
  })

  const toggleCategory = (category: string) => {
    setCollapsed(prev => ({ ...prev, [category]: !prev[category] }))
  }

  const getParamKey = (param: ComfyUIEditableParameter) =>
    `${param.node_id}.${param.input_name}`

  const getValue = (param: ComfyUIEditableParameter) => {
    const key = getParamKey(param)
    return values[key] ?? param.current_value ?? ''
  }

  const handleChange = (param: ComfyUIEditableParameter, value: string | number) => {
    const key = getParamKey(param)
    onChange({ ...values, [key]: value })
  }

  const renderInput = (param: ComfyUIEditableParameter) => {
    const value = getValue(param)
    const key = getParamKey(param)

    switch (param.input_type) {
      case 'STRING':
        // Use textarea for prompts, input for others
        if (param.category === 'prompt') {
          return (
            <textarea
              id={key}
              value={String(value)}
              onChange={(e) => handleChange(param, e.target.value)}
              disabled={disabled}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y min-h-[80px]"
              placeholder={param.display_name}
            />
          )
        }
        return (
          <input
            type="text"
            id={key}
            value={String(value)}
            onChange={(e) => handleChange(param, e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder={param.display_name}
          />
        )

      case 'INT':
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              id={key}
              value={value}
              onChange={(e) => handleChange(param, parseInt(e.target.value) || 0)}
              disabled={disabled}
              min={param.constraints.min}
              max={param.constraints.max}
              step={param.constraints.step || 1}
              className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {param.input_name === 'seed' && (
              <button
                type="button"
                onClick={() => handleChange(param, Math.floor(Math.random() * 4294967295))}
                disabled={disabled}
                className="px-3 py-2 rounded-lg bg-accent text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Random
              </button>
            )}
          </div>
        )

      case 'FLOAT':
        // Use slider for floats with defined range
        if (param.constraints.min !== undefined && param.constraints.max !== undefined) {
          const numValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0
          return (
            <div className="flex items-center gap-3">
              <input
                type="range"
                id={key}
                value={numValue}
                onChange={(e) => handleChange(param, parseFloat(e.target.value))}
                disabled={disabled}
                min={param.constraints.min}
                max={param.constraints.max}
                step={param.constraints.step || 0.01}
                className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
              />
              <input
                type="number"
                value={numValue}
                onChange={(e) => handleChange(param, parseFloat(e.target.value) || 0)}
                disabled={disabled}
                min={param.constraints.min}
                max={param.constraints.max}
                step={param.constraints.step || 0.01}
                className="w-20 px-2 py-1 rounded-lg bg-muted border border-border text-sm text-center"
              />
            </div>
          )
        }
        return (
          <input
            type="number"
            id={key}
            value={value}
            onChange={(e) => handleChange(param, parseFloat(e.target.value) || 0)}
            disabled={disabled}
            step={param.constraints.step || 0.01}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        )

      case 'COMBO':
        const choices = param.constraints.choices || []
        return (
          <select
            id={key}
            value={String(value)}
            onChange={(e) => handleChange(param, e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
          >
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        )

      default:
        return (
          <input
            type="text"
            id={key}
            value={String(value)}
            onChange={(e) => handleChange(param, e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        )
    }
  }

  if (parameters.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No editable parameters found in this workflow.</p>
        <p className="text-sm mt-1">The workflow will run with its default values.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sortedCategories.map((category) => {
        const categoryParams = groupedParams[category] || []
        const isCollapsed = collapsed[category]
        const categoryConfig = CATEGORY_CONFIG[category] || { label: category, order: 99 }

        return (
          <div key={category} className="border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              className="w-full px-4 py-3 flex items-center justify-between bg-muted/50 hover:bg-muted transition-colors"
            >
              <span className="text-sm font-medium text-foreground/80">
                {categoryConfig.label}
                <span className="ml-2 text-muted-foreground/70">
                  ({categoryParams.length})
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isCollapsed && '-rotate-90'
                )}
              />
            </button>

            {!isCollapsed && (
              <div className="p-4 space-y-4">
                {categoryParams.map((param) => (
                  <div key={getParamKey(param)}>
                    <label
                      htmlFor={getParamKey(param)}
                      className="block text-sm font-medium text-muted-foreground mb-1.5"
                    >
                      {param.display_name}
                      <span className="ml-2 text-xs text-muted-foreground/50">
                        ({param.node_class})
                      </span>
                    </label>
                    {renderInput(param)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
