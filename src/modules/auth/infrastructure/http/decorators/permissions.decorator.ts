import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'auth:permissions';

/**
 * @Permissions('api_keys:manage')
 *
 * Restringe o endpoint a usuarios cujo papel possui PELO MENOS UMA das
 * permissoes listadas (ou o curinga '*'). Combinar com
 * @UseGuards(JwtAuthGuard, PermissionsGuard).
 */
export const Permissions = (...permissoes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissoes);
