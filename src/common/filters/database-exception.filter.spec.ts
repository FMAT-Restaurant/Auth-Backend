import { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DatabaseExceptionFilter } from './database-exception.filter';

function run(code?: string) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  const error = new QueryFailedError(
    'INSERT INTO "staff_profiles" ("firstName") VALUES ($1)',
    ['x'.repeat(500)],
    Object.assign(new Error('value too long for type character varying(100)'), { code }),
  );
  new DatabaseExceptionFilter().catch(error, host);
  return { status, body: json.mock.calls[0][0] };
}

describe('[SEC #19] DatabaseExceptionFilter', () => {
  it('un valor demasiado largo responde 400 en vez de 500', () => {
    const { status, body } = run('22001');
    expect(status).toHaveBeenCalledWith(400);
    expect(body.message).toBe('Uno de los valores es demasiado largo');
  });

  it('un registro duplicado responde 409', () => {
    expect(run('23505').status).toHaveBeenCalledWith(409);
  });

  it('no expone la consulta, la tabla ni el mensaje original', () => {
    const { body } = run('22001');
    const text = JSON.stringify(body);
    expect(text).not.toContain('staff_profiles');
    expect(text).not.toContain('character varying');
    expect(text).not.toContain('INSERT');
  });

  it('un error desconocido responde 500 genérico', () => {
    const { status, body } = run('XX000');
    expect(status).toHaveBeenCalledWith(500);
    expect(body.message).toBe('Error interno del servidor');
  });
});
