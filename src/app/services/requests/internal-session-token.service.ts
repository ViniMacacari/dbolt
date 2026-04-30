import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class InternalSessionTokenService {
  private tokenPromise: Promise<string> | null = null

  getToken(): Promise<string> {
    this.tokenPromise ??= this.loadToken()
    return this.tokenPromise
  }

  private async loadToken(): Promise<string> {
    const bridge = window.dboltInternalApi

    if (!bridge?.getSessionToken) {
      throw new Error('Internal API session token is only available inside the DBOLT Electron app.')
    }

    const token = await bridge.getSessionToken()

    if (typeof token !== 'string' || token.length < 32) {
      throw new Error('Invalid internal API session token.')
    }

    return token
  }
}
