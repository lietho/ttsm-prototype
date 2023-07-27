import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * A safe interceptor that only logs request and response to the console.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {

  private logger = new Logger(LoggingInterceptor.name);

  /** @inheritDoc */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    this.logger.log(`New request`);
    this.logger.log(` > Request: ${request.method} ${request.url} ${JSON.stringify(request.body)}`);
    return next.handle().pipe(
      tap((res) => this.logger.log(` > Response: ${JSON.stringify(res)}`))
    );
  }
}
