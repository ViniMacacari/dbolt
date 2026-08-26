import { Injectable } from '@angular/core'

import { AppTheme, SqlHighlightColors } from '../app-settings/app-settings.service'

export interface AppThemeEditorPalette {
  monacoBase: 'vs' | 'vs-dark'
  contrastBackground: string
  surfaceColors: Record<string, string>
  fallbackHighlightColors: SqlHighlightColors
}

const DARK_HIGHLIGHT_COLORS: SqlHighlightColors = {
  keyword: '#739eca',
  function: '#f1e02d',
  identifier: '#e8e7e6',
  string: '#8fd694',
  number: '#d996ff',
  comment: '#7f8c98',
  operator: '#badedc',
  type: '#b7a0ff',
  variable: '#8bd5ca',
  delimiter: '#c9d1d9'
}

const LIGHT_HIGHLIGHT_COLORS: SqlHighlightColors = {
  keyword: '#005a9c',
  function: '#795e26',
  identifier: '#1f2933',
  string: '#267f3a',
  number: '#7a3e9d',
  comment: '#5f6b76',
  operator: '#374151',
  type: '#6b46c1',
  variable: '#8b3a62',
  delimiter: '#4b5563'
}

const DRACULA_HIGHLIGHT_COLORS: SqlHighlightColors = {
  keyword: '#ff79c6',
  function: '#50fa7b',
  identifier: '#f8f8f2',
  string: '#f1fa8c',
  number: '#bd93f9',
  comment: '#6d7fb8',
  operator: '#ff92d0',
  type: '#8be9fd',
  variable: '#ffb86c',
  delimiter: '#e2e4f0'
}

@Injectable({
  providedIn: 'root'
})
export class AppThemePaletteService {
  readonly minimumContrastRatio = 3.2

  private readonly palettes: Record<AppTheme, AppThemeEditorPalette> = {
    dark: {
      monacoBase: 'vs-dark',
      contrastBackground: '#1b1b1b',
      surfaceColors: {
        'editor.background': '#00000000',
        'editorGutter.background': '#00000000',
        'editor.lineHighlightBorder': '#00000000',
        'editor.lineHighlightBackground': '#ffffff08',
        'editorWidget.border': '#00000000',
        'focusBorder': '#00000000'
      },
      fallbackHighlightColors: DARK_HIGHLIGHT_COLORS
    },
    light: {
      monacoBase: 'vs',
      contrastBackground: '#ffffff',
      surfaceColors: {
        'editor.background': '#ffffff',
        'editorGutter.background': '#f6f8fa',
        'editor.lineHighlightBorder': '#00000000',
        'editor.lineHighlightBackground': '#00000008',
        'editorWidget.background': '#ffffff',
        'editorWidget.border': '#b8c5d1',
        'editorSuggestWidget.background': '#ffffff',
        'editorSuggestWidget.border': '#b8c5d1',
        'editorSuggestWidget.foreground': '#263442',
        'editorSuggestWidget.selectedBackground': '#d8eafb',
        'editorSuggestWidget.selectedForeground': '#17324d',
        'editorSuggestWidget.highlightForeground': '#005a9c',
        'editorHoverWidget.background': '#ffffff',
        'editorHoverWidget.border': '#b8c5d1',
        'focusBorder': '#00000000'
      },
      fallbackHighlightColors: LIGHT_HIGHLIGHT_COLORS
    },
    dracula: {
      monacoBase: 'vs-dark',
      contrastBackground: '#282a36',
      surfaceColors: {
        'editor.background': '#00000000',
        'editorGutter.background': '#00000000',
        'editor.lineHighlightBorder': '#00000000',
        'editor.lineHighlightBackground': '#44475a55',
        'editorWidget.background': '#21222c',
        'editorWidget.border': '#44475a',
        'editorSuggestWidget.background': '#21222c',
        'editorSuggestWidget.border': '#44475a',
        'editorSuggestWidget.foreground': '#f8f8f2',
        'editorSuggestWidget.selectedBackground': '#44475a',
        'editorSuggestWidget.selectedForeground': '#f8f8f2',
        'editorSuggestWidget.highlightForeground': '#8be9fd',
        'editorHoverWidget.background': '#21222c',
        'editorHoverWidget.border': '#44475a',
        'focusBorder': '#00000000'
      },
      fallbackHighlightColors: DRACULA_HIGHLIGHT_COLORS
    }
  }

  private readonly editorChromeColors: Record<AppTheme, Record<string, string>> = {
    dark: {
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editorCursor.foreground': '#ffffff',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#3a3d41'
    },
    light: {
      'editorLineNumber.foreground': '#7a8793',
      'editorLineNumber.activeForeground': '#263442',
      'editorCursor.foreground': '#111827',
      'editor.selectionBackground': '#add6ff',
      'editor.inactiveSelectionBackground': '#dbeafe'
    },
    dracula: {
      'editorLineNumber.foreground': '#7b85a8',
      'editorLineNumber.activeForeground': '#f8f8f2',
      'editorCursor.foreground': '#f8f8f2',
      'editor.selectionBackground': '#44475a',
      'editor.inactiveSelectionBackground': '#3a3d52'
    }
  }

  getEditorPalette(theme: AppTheme): AppThemeEditorPalette {
    return this.palettes[theme] || this.palettes.dark
  }

  getEditorChromeColors(theme: AppTheme): Record<string, string> {
    return this.editorChromeColors[theme] || this.editorChromeColors.dark
  }

  resolveHighlightColors(theme: AppTheme, colors: SqlHighlightColors): SqlHighlightColors {
    const palette = this.getEditorPalette(theme)

    return (Object.keys(colors) as Array<keyof SqlHighlightColors>).reduce((resolved, key) => ({
      ...resolved,
      [key]: this.adjustForContrast(
        colors[key],
        palette.contrastBackground,
        palette.fallbackHighlightColors[key]
      )
    }), {} as SqlHighlightColors)
  }

  adjustForContrast(color: string, background: string, fallback: string): string {
    if (this.hasAcceptableContrast(color, background)) return color

    const channels = this.toChannels(color)
    const backgroundLuminance = this.getRelativeLuminance(background)
    if (!channels || backgroundLuminance === null) return fallback

    const towardsWhite = backgroundLuminance < 0.18

    for (let step = 1; step <= 24; step += 1) {
      const adjusted = this.shiftChannels(channels, towardsWhite, step * 0.06)
      if (this.hasAcceptableContrast(adjusted, background)) return adjusted
    }

    return fallback
  }

  private shiftChannels(channels: number[], towardsWhite: boolean, amount: number): string {
    const shifted = channels.map((channel) => towardsWhite
      ? channel + (255 - channel) * amount
      : channel * (1 - amount)
    )

    return `#${shifted.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))
      .toString(16)
      .padStart(2, '0')).join('')}`
  }

  private toChannels(color: string): number[] | null {
    const normalized = String(color || '').replace('#', '')
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null

    return [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16))
  }

  hasAcceptableContrast(color: string, background: string): boolean {
    const contrastRatio = this.getContrastRatio(color, background)

    return contrastRatio !== null && contrastRatio >= this.minimumContrastRatio
  }

  getContrastRatio(color: string, background: string): number | null {
    const colorLuminance = this.getRelativeLuminance(color)
    const backgroundLuminance = this.getRelativeLuminance(background)
    if (colorLuminance === null || backgroundLuminance === null) return null

    const lighter = Math.max(colorLuminance, backgroundLuminance)
    const darker = Math.min(colorLuminance, backgroundLuminance)

    return (lighter + 0.05) / (darker + 0.05)
  }

  private getRelativeLuminance(color: string): number | null {
    const normalized = String(color || '').replace('#', '')
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null

    const linearChannels = [0, 2, 4]
      .map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255)
      .map((channel) => channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4)
      )

    return 0.2126 * linearChannels[0] + 0.7152 * linearChannels[1] + 0.0722 * linearChannels[2]
  }
}
