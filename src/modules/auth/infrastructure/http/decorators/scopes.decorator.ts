import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'auth:scopes';

/**
 * @RequireScopes('clientes:read', 'clientes:write')
 *
 * Exige que a API Key (autenticada via ApiKeyGuard) tenha TODOS os scopes
 * listados em `permissions.scopes`. Combinar com:
 *   @UseGuards(ApiKeyGuard, ScopesGuard)
 *
 * Convencao de scope: '<recurso>:<acao>'. Acoes comuns: read, write, admin.
 * Exemplos:
 *   - 'clientes:read'         — listar/buscar clientes
 *   - 'clientes:write'        — criar/atualizar clientes
 *   - 'vendedoras:read'
 *   - 'agente_eventos:write'  — chamado pelo n8n para gravar trilha
 *   - 'agente_eventos:read'   — leitura para dashboards/relatorios
 */
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
