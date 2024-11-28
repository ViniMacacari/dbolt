import { Injectable } from '@angular/core'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Observable, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'

@Injectable({
  providedIn: 'root'
})
export class InternalApiService {

  constructor(private http: HttpClient) { }

  get<T>(url: string): Observable<T> {
    return this.http.get<T>(url).pipe(catchError(this.handleError))
  }

  post<T>(url: string, body: any): Observable<T> {
    return this.http.post<T>(url, body).pipe(catchError(this.handleError))
  }

  put<T>(url: string, body: any): Observable<T> {
    return this.http.put<T>(url, body).pipe(catchError(this.handleError))
  }

  patch<T>(url: string, body: any): Observable<T> {
    return this.http.patch<T>(url, body).pipe(catchError(this.handleError))
  }

  delete<T>(url: string): Observable<T> {
    return this.http.delete<T>(url).pipe(catchError(this.handleError))
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Ocorreu um erro'
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Erro: ${error.error.message}`
    } else {
      errorMessage = `Erro: ${error.status}, ${error.message}`
    }
    return throwError(() => new Error(errorMessage))
  }
}