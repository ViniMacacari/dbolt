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

  private handleError(error: any): any {
    if (error instanceof HttpErrorResponse) {
      if (error.error && typeof error.error === 'object') {
        return error.error
      }
  
      return {
        success: false,
        message: 'Unknown error from API',
        error: error.message || 'No error detail available'
      }
    }
  
    return {
      success: false,
      message: 'Unexpected error',
      error: error.message || error.toString()
    }
  }  
}
