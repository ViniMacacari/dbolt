import { Injectable } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http'
import { firstValueFrom } from 'rxjs'

import { InternalSessionTokenService } from './internal-session-token.service'

@Injectable({
  providedIn: 'root'
})
export class InternalApiService {
  private readonly baseUrl: string = 'http://127.0.0.1:47953'

  constructor(
    private http: HttpClient,
    private sessionToken: InternalSessionTokenService
  ) { }

  async get<T>(url: string): Promise<T> {
    try {
      return await firstValueFrom(this.http.get<T>(this.baseUrl + url, await this.requestOptions()))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async post<T>(url: string, body: any): Promise<T> {
    try {
      return await firstValueFrom(this.http.post<T>(this.baseUrl + url, body, await this.requestOptions()))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async put<T>(url: string, body: any): Promise<T> {
    try {
      return await firstValueFrom(this.http.put<T>(this.baseUrl + url, body, await this.requestOptions()))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async patch<T>(url: string, body: any): Promise<T> {
    try {
      return await firstValueFrom(this.http.patch<T>(this.baseUrl + url, body, await this.requestOptions()))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async delete<T>(url: string): Promise<T> {
    try {
      return await firstValueFrom(this.http.delete<T>(this.baseUrl + url, await this.requestOptions()))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  private async requestOptions(): Promise<{ headers: HttpHeaders }> {
    return {
      headers: new HttpHeaders({
        'x-dbolt-session-token': await this.sessionToken.getToken()
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
