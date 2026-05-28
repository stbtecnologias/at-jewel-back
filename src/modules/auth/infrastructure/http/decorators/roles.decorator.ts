import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '../../../domain/entities/admin-user.entity';

export const ROLES_KEY = 'auth:roles';

/**
 * @Roles('ADMIN', 'GERENTE')
 *
 * Restringe o endpoint a usuarios autenticados via JWT cujo role esta na lista.
 * Combinar com @UseGuards(JwtAuthGuard, RolesGuard) — JwtAuthGuard valida o
 * token e popula request.user; RolesGuard checa o role contra esta lista.
 *
 * Quando nao usado, RolesGuard nao restringe (deixa passar).
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
