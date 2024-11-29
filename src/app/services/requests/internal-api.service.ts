import { Injectable } from '@angular/core'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { firstValueFrom } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class InternalApiService {
  private baseUrl: string = 'http://localhost:47953'

  constructor(private http: HttpClient) { }

  async get<T>(url: string): Promise<T> {
    try {
      return await firstValueFrom(this.http.get<T>(this.baseUrl + url))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async post<T>(url: string, body: any): Promise<T> {
    try {
      return await firstValueFrom(this.http.post<T>(this.baseUrl + url, body))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async put<T>(url: string, body: any): Promise<T> {
    try {
      return await firstValueFrom(this.http.put<T>(this.baseUrl + url, body))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async patch<T>(url: string, body: any): Promise<T> {
    try {
      return await firstValueFrom(this.http.patch<T>(this.baseUrl + url, body))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async delete<T>(url: string): Promise<T> {
    try {
      return await firstValueFrom(this.http.delete<T>(this.baseUrl + url))
    } catch (error) {
      throw this.handleError(error)
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