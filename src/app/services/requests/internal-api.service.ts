import { Injectable } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http'
import { firstValueFrom } from 'rxjs'

import { InternalSessionTokenService } from './internal-session-token.service'

@Injectable({
  providedIn: 'root'
})
export class InternalApiService {
  constructor(
    private http: HttpClient,
    private sessionToken: InternalSessionTokenService
  ) { }

  async get<T>(url: string): Promise<T> {
    try {
      const options = await this.requestOptions()
      return await firstValueFrom(this.http.get<T>(options.baseUrl + url, { headers: options.headers }))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async post<T>(url: string, body: any): Promise<T> {
    try {
      const options = await this.requestOptions()
      return await firstValueFrom(this.http.post<T>(options.baseUrl + url, body, { headers: options.headers }))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async postWithSignal<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
    try {
      const session = await this.sessionToken.getSession()
      const response = await fetch(session.baseUrl + url, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          [session.tokenHeader]: session.token
        },
        body: JSON.stringify(body),
        signal
      })

      if (!response.ok) {
        throw await this.buildFetchFailure(response)
      }

      return await response.json() as T
    } catch (error: unknown) {
      if (this.isAbortError(error)) {
        throw error
      }

      throw this.handleError(error)
    }
  }

  isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
  }

  async postStream<T>(
    url: string,
    body: unknown,
    onEvent: (event: T) => void,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const session = await this.sessionToken.getSession()
      const response = await fetch(session.baseUrl + url, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          [session.tokenHeader]: session.token
        },
        body: JSON.stringify(body),
        signal
      })

      if (!response.ok) {
        throw new Error(await this.readFetchError(response))
      }

      if (!response.body) {
        throw new Error('The internal API did not return a response stream.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        buffer = this.consumeStreamLines(buffer, onEvent)

        if (done) break
      }

      if (buffer.trim()) {
        this.emitStreamEvent(buffer, onEvent)
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async put<T>(url: string, body: any): Promise<T> {
    try {
      const options = await this.requestOptions()
      return await firstValueFrom(this.http.put<T>(options.baseUrl + url, body, { headers: options.headers }))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async patch<T>(url: string, body: any): Promise<T> {
    try {
      const options = await this.requestOptions()
      return await firstValueFrom(this.http.patch<T>(options.baseUrl + url, body, { headers: options.headers }))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async delete<T>(url: string): Promise<T> {
    try {
      const options = await this.requestOptions()
      return await firstValueFrom(this.http.delete<T>(options.baseUrl + url, { headers: options.headers }))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  private async requestOptions(): Promise<{ baseUrl: string; headers: HttpHeaders }> {
    const session = await this.sessionToken.getSession()

    return {
      baseUrl: session.baseUrl,
      headers: new HttpHeaders({
        [session.tokenHeader]: session.token
      })
    }
  }

  private consumeStreamLines<T>(buffer: string, onEvent: (event: T) => void): string {
    const lines = buffer.split('\n')
    const remaining = lines.pop() || ''

    for (const line of lines) {
      if (line.trim()) {
        this.emitStreamEvent(line, onEvent)
      }
    }

    return remaining
  }

  private emitStreamEvent<T>(line: string, onEvent: (event: T) => void): void {
    try {
      onEvent(JSON.parse(line) as T)
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new Error('The internal API returned an invalid streamed response.')
      }

      throw error
    }
  }

  private async readFetchError(response: Response): Promise<string> {
    const failure = await this.buildFetchFailure(response)
    return failure.message
  }

  /**
   * Keeps the failure shape the internal API already returns, so callers can
   * still read `code` and `sqlState` and tell a lost connection apart from a
   * rejected statement.
   */
  private async buildFetchFailure(response: Response): Promise<{
    success: false
    message: string
    error: string
    code: unknown
    sqlState: unknown
  }> {
    let payload: Record<string, unknown> | null = null

    try {
      payload = await response.json() as Record<string, unknown>
    } catch (_error: unknown) {
      payload = null
    }

    const detail = [payload?.['error'], payload?.['message']]
      .find((value) => typeof value === 'string' && value.trim()) as string | undefined
    const message = detail || `Internal API request failed (${response.status}).`

    return {
      success: false,
      message,
      error: message,
      code: payload?.['code'] ?? null,
      sqlState: payload?.['sqlState'] ?? null
    }
  }

  private handleError(error: any): any {
    if (error instanceof HttpErrorResponse) {
      if (error.error && typeof error.error === 'object') {
        return error.error
      }

      return {
        success: false,
        message: this.describeTransportError(error),
        error: this.describeTransportError(error)
      }
    }

    if (error && typeof error === 'object' && 'success' in error) {
      return error
    }

    const message = error?.message || String(error ?? 'Unexpected error')

    return {
      success: false,
      message,
      error: message
    }
  }

  /**
   * A request that never reaches the internal API arrives with status 0 and an
   * empty body. Reporting it as a connection failure lets the callers retry the
   * database connection instead of showing an empty error to the user.
   */
  private describeTransportError(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Connection lost: the internal API did not answer the request.'
    }

    return error.message || 'No error detail available'
  }
}
