# AT Jewel API

API REST para gestão de produtos de joalheria com integração ERP (Safira) e autenticação completa via JWT e API Keys.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | NestJS 11 |
| Linguagem | TypeScript 5.7 |
| Banco de dados | PostgreSQL 16 |
| ORM | TypeORM |
| Autenticação | JWT (Passport.js) + API Keys |
| Cache | cache-manager (in-memory, TTL 5 min) |
| Validação | class-validator / class-transformer |
| Runtime | Node.js 22 |
| Containers | Docker / Docker Compose |

---

## Arquitetura

O projeto segue **Clean Architecture com DDD (Domain-Driven Design)**:

```
src/
├── modules/
│   ├── auth/               # Autenticação (JWT + API Keys)
│   ├── erp/                # Integração webhook Safira ERP
│   └── produtos/           # CRUD de produtos
└── shared/
    └── database/
        └── migrations/     # SQL migrations manuais
```

Cada módulo segue a separação em camadas:

```
<modulo>/
├── domain/           # Entidades e interfaces (ports)
├── application/      # Use cases (regras de negócio)
└── infrastructure/
    ├── http/         # Controllers, Guards, DTOs, Strategies
    └── database/     # Repositórios TypeORM
```

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Banco de dados
POSTGRES_USER=atjewel
POSTGRES_PASSWORD=changeme
POSTGRES_DB=atjewel_dev

# Aplicação
PORT=3000
NODE_ENV=development
TZ=America/Sao_Paulo

# Autenticação
JWT_SECRET=<segredo-jwt-forte-e-aleatorio>

# Integração ERP Safira
SAFIRA_API_KEY=<chave-fornecida-pela-safira>
```

---

## Instalação e Execução

### Pré-requisitos

- Docker e Docker Compose instalados
- Rede Docker `atjewel_network` criada:
  ```bash
  docker network create atjewel_network
  ```

### Subir com Docker

```bash
docker compose up -d
```

### Desenvolvimento local

```bash
npm install
npm run start:dev
```

### Build para produção

```bash
npm run build
npm run start:prod
```

---

## Banco de Dados

As migrations são SQL manuais em `src/shared/database/migrations/`. Execute na ordem:

```bash
# 01 - Tabela de produtos e eventos ERP
psql -U atjewel -d atjewel_dev -f src/shared/database/migrations/01_init.sql

# 02 - Tabelas de autenticação
psql -U atjewel -d atjewel_dev -f src/shared/database/migrations/02_auth.sql
```

### Esquema das Tabelas

#### `admin_users`
| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador |
| email | varchar(255) unique | E-mail do admin |
| password_hash | varchar(255) | Senha em bcrypt |
| refresh_token_hash | varchar(64) | Hash SHA256 do refresh token atual |
| created_at | timestamptz | Data de criação |

#### `api_keys`
| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador |
| name | varchar(255) | Nome descritivo |
| key_prefix | varchar(12) | Prefixo da chave (ex: `sk_live_abc1`) |
| key_hash | varchar(64) unique | Hash SHA256 da chave raw |
| permissions | jsonb | Permissões da chave |
| is_active | boolean | Chave ativa/revogada |
| last_used_at | timestamptz | Último uso |
| created_by_id | UUID FK | Admin que criou |
| created_at | timestamptz | Data de criação |
| revoked_at | timestamptz | Data de revogação |

#### `produtos`
| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador |
| codigo_erp | varchar(50) unique | Código no sistema Safira |
| categoria | varchar(50) | Categoria |
| familia | varchar(50) | Família |
| colecao | varchar(100) | Coleção |
| cor | varchar(100) | Cor / tipo de ouro |
| tamanho | varchar(50) | Tamanho / aro |
| tipo_pedra | varchar(50) | Tipo de pedra |
| colecao_pedra | varchar(50) | Coleção da pedra |
| referencia_fornecedor | varchar(100) | Referência do fornecedor |
| descricao_etiqueta | varchar(255) | Descrição da etiqueta |
| peso_gramas | decimal(10,4) | Peso em gramas |
| unidade | varchar(20) | Unidade de medida |
| valor_compra | decimal(15,2) | Valor de compra |
| valor_custo | decimal(15,2) | Valor de custo |
| margem_percentual | decimal(5,2) | Margem em % |
| valor_venda | decimal(15,2) | Valor de venda |
| observacao | text | Observações |
| foto_url | varchar(500) | URL da foto |
| ativo | boolean | Produto ativo |
| criado_em | timestamptz | Data de criação |
| atualizado_em | timestamptz | Última atualização |

#### `erp_eventos_processados`
| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador |
| evento_id | UUID unique | ID do evento vindo do Safira |
| entidade_tipo | varchar(50) | Tipo da entidade |
| processado_em | timestamptz | Data de processamento |

---

## Endpoints

### Health Check

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | — | Status da API |

**Resposta:**
```json
{ "status": "ok", "timestamp": "2026-05-25T12:00:00.000Z" }
```

---

### Autenticação (`/auth`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/auth/login` | — | Login de admin |
| POST | `/auth/refresh` | — | Renova access token |
| POST | `/auth/api-keys` | JWT | Cria API Key |
| GET | `/auth/api-keys` | JWT | Lista API Keys |
| DELETE | `/auth/api-keys/:id` | JWT | Revoga API Key |

#### POST `/auth/login`
```json
// Request
{ "email": "admin@example.com", "password": "minimo8chars" }

// Response 200
{ "accessToken": "<jwt>", "refreshToken": "<token>" }
```

#### POST `/auth/refresh`
```json
// Request
{ "refreshToken": "<token>" }

// Response 200
{ "accessToken": "<novo-jwt>" }
```

> Access token expira em **15 minutos**. Use o refresh token para renová-lo.

#### POST `/auth/api-keys`
```
Authorization: Bearer <accessToken>
```
```json
// Request
{ "name": "Integração App Mobile" }

// Response 201
{
  "id": "uuid",
  "name": "Integração App Mobile",
  "keyPrefix": "sk_live_abc1",
  "rawKey": "sk_live_abc1...",
  "createdAt": "2026-05-25T12:00:00.000Z"
}
```

> `rawKey` é retornado **uma única vez**. Guarde imediatamente — não é possível recuperá-lo depois.

---

### Produtos (`/produtos`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/produtos` | — | Lista produtos |
| GET | `/produtos/:id` | — | Busca produto por ID |
| POST | `/produtos` | — | Cria produto |
| PATCH | `/produtos/:id` | — | Atualiza produto |
| DELETE | `/produtos/:id` | — | Remove produto |

#### GET `/produtos`
Query params opcionais: `categoria`, `familia`, `ativo`

```
GET /produtos?categoria=anel&ativo=true
```

#### POST `/produtos`
```json
{
  "categoria": "anel",
  "familia": "solitario",
  "unidade": "UN",
  "valorVenda": 1500.00,
  "colecao": "verão 2026",
  "cor": "ouro 18k",
  "tamanho": "18",
  "tipoPedra": "diamante",
  "pesoGramas": 3.5200,
  "valorCompra": 800.00,
  "valorCusto": 900.00,
  "margemPercentual": 66.67
}
```

#### PATCH `/produtos/:id`
Todos os campos são opcionais. Apenas os campos enviados são atualizados.

---

### Integração ERP Safira (`/erp`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/erp/produtos` | x-safira-key | Recebe webhook de produto |

```
x-safira-key: <SAFIRA_API_KEY>
```

O endpoint é **idempotente** — eventos duplicados (mesmo `eventoId`) são ignorados com segurança.

```json
// Response 200 — evento novo
{ "ok": true, "idempotente": false }

// Response 200 — evento já processado anteriormente
{ "ok": true, "idempotente": true }
```

---

## Mecanismos de Autenticação

### JWT (Admins)

Usado para operações administrativas (gerenciar API Keys, etc.).

```
Authorization: Bearer <accessToken>
```

Fluxo:
1. `POST /auth/login` → recebe `accessToken` (15 min) + `refreshToken`
2. Quando o access token expirar → `POST /auth/refresh` com o `refreshToken`
3. Novo `accessToken` é emitido

### API Keys (Integrações externas)

Usado por aplicações externas que consomem a API.

```
x-api-key: sk_live_...
```

- Formato: `sk_live_` + 64 hex chars
- Armazenada apenas o hash SHA256 — a chave raw é exibida **somente na criação**
- Cache de 5 minutos para reduzir consultas ao banco
- Revogação invalida o cache imediatamente

### Safira ERP Key

Chave estática configurada via env `SAFIRA_API_KEY`, exclusiva para o webhook do ERP.

```
x-safira-key: <valor>
```

---

## Testes

```bash
# Unitários
npm run test

# Watch mode
npm run test:watch

# Cobertura
npm run test:cov

# E2E
npm run test:e2e
```

---

## Primeiro Acesso

Ainda não existe um endpoint de cadastro de admin. Para criar o primeiro usuário, insira diretamente no banco:

```sql
INSERT INTO admin_users (id, email, password_hash, created_at)
VALUES (
  gen_random_uuid(),
  'admin@suaempresa.com',
  '<hash-bcrypt-da-senha>',
  now()
);
```

Para gerar o hash bcrypt via Node.js:

```js
const bcrypt = require('bcrypt');
console.log(await bcrypt.hash('sua-senha-aqui', 12));
```
