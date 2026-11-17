import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** Códigos de error de PostgreSQL que se pueden explicar al cliente. */
const PG_ERRORS: Record<string, { status: number; message: string }> = {
  '22001': { status: HttpStatus.BAD_REQUEST, message: 'Uno de los valores es demasiado largo' },
  '22P02': { status: HttpStatus.BAD_REQUEST, message: 'Uno de los valores tiene un formato inválido' },
  '23502': { status: HttpStatus.BAD_REQUEST, message: 'Falta un dato obligatorio' },
  '23503': { status: HttpStatus.CONFLICT, message: 'El registro está relacionado con otros datos' },
  '23505': { status: HttpStatus.CONFLICT, message: 'El registro ya existe' },
};

/**
 * Convierte los errores de la base de datos en respuestas 400/409 sin exponer
 * el detalle (nombres de tablas, columnas o valores). Antes cualquier dato que
 * no cupiera en su columna terminaba en un 500 (#19).
 */
@Catch(QueryFailedError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const code = (exception.driverError as { code?: string } | undefined)?.code ?? '';
    const known = PG_ERRORS[code];

    if (!known) {
      this.logger.error(`Error de base de datos no controlado (${code || 'sin código'})`, exception.stack);
    }

    const status = known?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      statusCode: status,
      message: known?.message ?? 'Error interno del servidor',
    });
  }
}
