import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { GlobalExceptionFilter } from './global-exception.filter';

function makeHost(method = 'GET', url = '/test'): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method, url }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  const ORIGINAL_ENV = { ...process.env };
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    filter = new GlobalExceptionFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('mantem shape consistente para NotFoundException', () => {
    const { host, status, json } = makeHost();
    filter.catch(new NotFoundException('Cliente xyz nao existe'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        message: 'Cliente xyz nao existe',
      }),
    );
  });

  it('mapeia codigo HTTP -> error name', () => {
    const cases: [HttpException, number, string][] = [
      [new BadRequestException(), 400, 'Bad Request'],
      [new ConflictException(), 409, 'Conflict'],
      [new UnprocessableEntityException(), 422, 'Unprocessable Entity'],
      [new InternalServerErrorException(), 500, 'Internal Server Error'],
    ];

    for (const [exc, expectedStatus, expectedError] of cases) {
      const { host, status, json } = makeHost();
      filter.catch(exc, host);
      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expectedError }),
      );
    }
  });

  it('preserva campos extras (details) do response object', () => {
    const { host, json } = makeHost();
    const exc = new UnprocessableEntityException({
      message: 'Payload com PII',
      motivos: ['campo.foo: parece telefone'],
    });
    filter.catch(exc, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        details: { motivos: ['campo.foo: parece telefone'] },
      }),
    );
  });

  it('mascara mensagem em producao quando erro nao e HttpException', () => {
    process.env.NODE_ENV = 'production';
    const { host, json } = makeHost();
    filter.catch(new Error('detalhe interno sensivel'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Erro interno do servidor',
      }),
    );
    // stack nunca em producao
    const body = json.mock.calls[0][0];
    expect(body.stack).toBeUndefined();
  });

  it('expoe mensagem original em dev para erro generico', () => {
    process.env.NODE_ENV = 'development';
    const { host, json } = makeHost();
    filter.catch(new Error('detalhe util pra debug'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'detalhe util pra debug',
        stack: expect.any(String),
      }),
    );
  });

  it('inclui stack em dev mas nao em prod para HttpException', () => {
    process.env.NODE_ENV = 'production';
    const { host: hostProd, json: jsonProd } = makeHost();
    filter.catch(new BadRequestException('x'), hostProd);
    expect(jsonProd.mock.calls[0][0].stack).toBeUndefined();

    process.env.NODE_ENV = 'development';
    const { host: hostDev, json: jsonDev } = makeHost();
    filter.catch(new BadRequestException('x'), hostDev);
    expect(jsonDev.mock.calls[0][0].stack).toBeTruthy();
  });

  it('loga 5xx mas nao loga 4xx (evita poluicao)', () => {
    const errorSpy = filter['logger'].error as jest.Mock;
    errorSpy.mockClear();

    filter.catch(new NotFoundException('x'), makeHost().host);
    expect(errorSpy).not.toHaveBeenCalled();

    filter.catch(new InternalServerErrorException('y'), makeHost().host);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('trata ThrottlerException com nome "Too Many Requests"', () => {
    const { host, status, json } = makeHost();
    filter.catch(new ThrottlerException(), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Too Many Requests' }),
    );
  });

  it('aceita response como string', () => {
    const { host, json } = makeHost();
    filter.catch(new HttpException('msg simples', 418), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 418, message: 'msg simples' }),
    );
  });
});
