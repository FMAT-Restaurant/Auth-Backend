import * as bcrypt from 'bcrypt';
import { BCRYPT_COST, JWT_AUDIENCE } from './security.constant';
import { refreshTokenTtlMs } from '../../auth/auth.service';
import { StaffController } from '../../staff/staff.controller';
import { RolesController } from '../../roles/roles.controller';
import { TemporaryPasswordGuard } from '../guards/temporary-password.guard';

describe('[SEC] Constantes y configuración de seguridad', () => {
  // #32 (ERS-GAP-05)
  describe('BCRYPT_COST (#32)', () => {
    it('es al menos 12', () => {
      expect(BCRYPT_COST).toBeGreaterThanOrEqual(12);
    });

    it('bcrypt genera hashes con ese costo', async () => {
      const hash = await bcrypt.hash('ClaveDePrueba1', BCRYPT_COST);
      expect(hash.startsWith(`$2b$${BCRYPT_COST}$`)).toBe(true);
    });
  });

  // #36 (ERS-GAP-07)
  describe('JWT y TTLs (#36)', () => {
    it('define una audiencia (claim aud)', () => {
      expect(JWT_AUDIENCE).toMatch(/^urn:fmat:/);
    });

    it('el refresh token no puede exceder 14 días', () => {
      const catorceDias = 14 * 24 * 60 * 60 * 1000;
      // Un valor dentro del límite se respeta.
      expect(refreshTokenTtlMs({ REFRESH_TOKEN_TTL_DAYS: '14' } as NodeJS.ProcessEnv)).toBe(
        catorceDias,
      );
      // Un valor por encima del máximo cae al valor por defecto (7 días), no a 20.
      expect(
        refreshTokenTtlMs({ REFRESH_TOKEN_TTL_DAYS: '20' } as NodeJS.ProcessEnv),
      ).toBeLessThanOrEqual(catorceDias);
    });
  });

  // #30 (ERS-GAP-02): el guard debe estar aplicado en los controladores sensibles.
  describe('TemporaryPasswordGuard aplicado (#30)', () => {
    it('está en los guards de StaffController y RolesController', () => {
      const staffGuards = Reflect.getMetadata('__guards__', StaffController) || [];
      const rolesGuards = Reflect.getMetadata('__guards__', RolesController) || [];
      expect(staffGuards).toContain(TemporaryPasswordGuard);
      expect(rolesGuards).toContain(TemporaryPasswordGuard);
    });
  });
});
