import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Appends Bearer token to outgoing requests and retries once after a 401 with a refreshed token. */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);

  const addToken = (request: HttpRequest<unknown>): HttpRequest<unknown> => {
    const token = authService.getToken();
    if (!token) return request;
    return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  };

  return next(addToken(req)).pipe(
    catchError((error) => {
      const isRefreshRequest = req.url.includes('/auth/refresh');
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isRefreshRequest
      ) {
        return authService.refreshToken().pipe(
          switchMap(() => next(addToken(req))),
          catchError((refreshError) => {
            authService.logout();
            return throwError(() => refreshError);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
