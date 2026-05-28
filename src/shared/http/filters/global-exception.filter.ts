import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  details?: unknown;
  // Em producao stack nunca aparece; em dev sim para debug.
  stack?: string;
}

/**
 * Exception filter global.
 *
 * Garante shape consistente de erro em toda a API e impede que stack traces
 * vazem em producao. Trata:
 *   - HttpException (incluindo erros do class-validator e ThrottlerException)
 *   - Erros genericos (Error / desconhecidos) -> 500 sanitizado
 *
 * Em producao (NODE_ENV=production):
 *   - 5xx vira mensagem generica ("Erro interno do servidor")
 *   - stack trace omitido sempre
 *
 * Em dev:
 *   - Mensagem original mantida
 *   - Stack trace incluido no body (debug)
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProd = process.env.NODE_ENV === 'production';
    const body = this.buildBody(exception, isProd);

    // Log so dos erros nao-esperados (5xx ou nao-HttpException).
    // 4xx sao "esperados" (validacao, auth falha, etc.) — nao poluem o log.
    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode} ${body.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown, isProd: boolean): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();

      // class-validator devolve { statusCode, message: string[], error }
      // ThrottlerException retorna string. HttpException pode ter so message.
      let message: string | string[];
      let details: unknown;

      if (typeof resp === 'string') {
        message = resp;
      } else if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>;
        message = (r.message as string | string[]) ?? exception.message;
        // Captura campos extras (ex.: 'motivos' do detectarPii).
        const { statusCode: _sc, error: _err, message: _msg, ...extras } = r;
        if (Object.keys(extras).length > 0) {
          details = extras;
        }
      } else {
        message = exception.message;
      }

      const body: ErrorBody = {
        statusCode: status,
        error: this.errorNameFromStatus(status, exception),
        message,
      };
      if (details !== undefined) body.details = details;
      if (!isProd && exception.stack) body.stack = exception.stack;
      return body;
    }

    // Erro desconhecido. Em producao mascarar; em dev expor para debug.
    const message = isProd
      ? 'Erro interno do servidor'
      : exception instanceof Error
        ? exception.message
        : String(exception);

    const body: ErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message,
    };
    if (!isProd && exception instanceof Error && exception.stack) {
      body.stack = exception.stack;
    }
    return body;
  }

  private errorNameFromStatus(status: number, exc: HttpException): string {
    if (exc instanceof ThrottlerException) return 'Too Many Requests';

    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 409:
        return 'Conflict';
      case 422:
        return 'Unprocessable Entity';
      case 429:
        return 'Too Many Requests';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Error';
    }
  }
}
