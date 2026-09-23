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

  describe('erro de upload (multer)', () => {
    function erroMulter(code: string): Error {
      const e = new Error('File too large');
      e.name = 'MulterError';
      (e as Error & { code: string }).code = code;
      return e;
    }

    it('vira 413 com mensagem legivel, e nao 500', () => {
      const { host, status, json } = makeHost('POST', '/catalogos/x/referencias/imagens');
      filter.catch(erroMulter('LIMIT_FILE_SIZE'), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Arquivo grande demais para este envio.' }),
      );
    });

    it('em producao a mensagem SOBREVIVE — nao e erro interno para mascarar', () => {
      process.env.NODE_ENV = 'production';
      const { host, json } = makeHost('POST', '/catalogos/x/referencias/imagens');
      filter.catch(erroMulter('LIMIT_FILE_SIZE'), host);

      // Sem o ramo proprio, isto virava "Erro interno do servidor" e a pessoa
      // nunca saberia que bastava mandar um arquivo menor.
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Arquivo grande demais para este envio.' }),
      );
    });

    it('arquivos demais tem mensagem propria', () => {
      const { host, json } = makeHost('POST', '/x');
      filter.catch(erroMulter('LIMIT_FILE_COUNT'), host);

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Arquivos demais num envio só.' }),
      );
    });
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

  describe('violacao de unicidade (23505)', () => {
    function duplicata(constraint: string, detail: string): Error {
      const e = new Error(
        'duplicate key value violates unique constraint "' + constraint + '"',
      ) as Error & { code: string; constraint: string; detail: string };
      e.code = '23505';
      e.constraint = constraint;
      e.detail = detail;
      return e;
    }

    const PECA_REPETIDA = () =>
      duplicata('produtos_codigo_erp_key', 'Key (codigo_erp)=(C025109) already exists.');

    it('vira 409 com a frase legivel, e nao 500', () => {
      const { host, status, json } = makeHost('POST', '/produtos');
      filter.catch(PECA_REPETIDA(), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(json).toHaveBeenCalledWith({
        statusCode: 409,
        error: 'Conflict',
        message: 'Já existe uma peça com o código C025109.',
      });
    });

    /**
     * O DEFEITO ERA PIOR EM PRODUCAO: o ramo de erro desconhecido troca a
     * mensagem por "Erro interno do servidor". A vendedora nao ficava sabendo
     * que bastava trocar o codigo.
     */
    it('em producao diz a mesma coisa — nao vira "Erro interno do servidor"', () => {
      process.env.NODE_ENV = 'production';
      const { host, status, json } = makeHost('POST', '/produtos');
      filter.catch(PECA_REPETIDA(), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Já existe uma peça com o código C025109.' }),
      );
    });

    /** Nem em dev: `stack` so acompanha HttpException. */
    it('nunca leva stack nem o texto do Postgres', () => {
      process.env.NODE_ENV = 'development';
      const { host, json } = makeHost('POST', '/produtos');
      filter.catch(PECA_REPETIDA(), host);

      const corpo = json.mock.calls[0][0] as Record<string, unknown>;
      expect(corpo.stack).toBeUndefined();
      expect(JSON.stringify(corpo)).not.toContain('duplicate key');
      expect(JSON.stringify(corpo)).not.toContain('produtos_codigo_erp_key');
    });

    /** 4xx nao polui o log — a regra que ja valia para os outros. */
    it('nao vai para o log de erro', () => {
      const errorSpy = jest.spyOn(filter['logger'], 'error');
      const { host } = makeHost('POST', '/produtos');
      filter.catch(PECA_REPETIDA(), host);

      expect(errorSpy).not.toHaveBeenCalled();
    });

    /** Chave estrangeira segue como estava — este ramo nao a captura. */
    it('outro erro de banco continua caindo em 500', () => {
      const e = new Error('violates foreign key constraint') as Error & { code: string };
      e.code = '23503';
      const { host, status } = makeHost('POST', '/produtos');
      filter.catch(e, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
