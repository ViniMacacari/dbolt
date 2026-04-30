import { Injectable } from '@angular/core'

export interface InternalApiSession {
  baseUrl: string
  token: string
  tokenHeader: string
}

@Injectable({
  providedIn: 'root'
})
export class InternalSessionTokenService {
  private sessionPromise: Promise<InternalApiSession> | null = null

  getSession(): Promise<InternalApiSession> {
    this.sessionPromise ??= this.loadSession()
    return this.sessionPromise
  }

  private async loadSession(): Promise<InternalApiSession> {
    const bridge = window.dboltInternalApi

    if (!bridge?.getSession) {
      return this.loadBrowserDevSession()
    }

    const session = await bridge.getSession()

    return this.validateSession(session)
  }

  private async loadBrowserDevSession(): Promise<InternalApiSession> {
    if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      throw new Error('Internal API session is only available inside the DBOLT Electron app.')
    }

    const response = await fetch('http://127.0.0.1:47953/api/internal-session', {
      cache: 'no-store',
      credentials: 'omit'
    })

    if (!response.ok) {
      throw new Error('Could not load browser dev internal API session.')
    }

    return this.validateSession(await response.json())
  }

  private validateSession(session: InternalApiSession): InternalApiSession {
    const isLocalApiUrl = typeof session.baseUrl === 'string' && /^http:\/\/127\.0\.0\.1:\d+$/.test(session.baseUrl)
    const isHeaderName = typeof session.tokenHeader === 'string' && /^[a-z0-9-]+$/i.test(session.tokenHeader)

    if (!isLocalApiUrl || !isHeaderName || typeof session.token !== 'string' || session.token.length < 32) {
      throw new Error('Invalid internal API session.')
    }

    return session
  }
}
