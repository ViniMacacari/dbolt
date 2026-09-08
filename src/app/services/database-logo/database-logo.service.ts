import { Injectable } from '@angular/core'

import {
  DATABASE_LOGO_BY_TYPE,
  DATABASE_LOGO_FALLBACK
} from '../../config/database-logo.config'
import { AppThemeService } from '../theme/app-theme.service'

@Injectable({
  providedIn: 'root'
})
export class DatabaseLogoService {
  constructor(private theme: AppThemeService) { }

  path(databaseType: unknown): string {
    const logo = DATABASE_LOGO_BY_TYPE[this.normalizeDatabaseType(databaseType)]
    if (!logo) return DATABASE_LOGO_FALLBACK

    const variant = this.theme.getTheme() === 'light' ? 'color' : 'light'
    return `db-logo/${logo}-${variant}.png`
  }

  private normalizeDatabaseType(databaseType: unknown): string {
    return String(databaseType || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  }
}
