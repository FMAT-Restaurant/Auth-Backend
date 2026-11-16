import { InitialSchema1762900000000 } from './1762900000000-InitialSchema';
import { SessionVersionAndHashedTempPasswords1762900000001 } from './1762900000001-SessionVersionAndHashedTempPasswords';

/** Migraciones en orden. Se agregan aquí las nuevas al cambiar una entidad. */
export const MIGRATIONS = [
  InitialSchema1762900000000,
  SessionVersionAndHashedTempPasswords1762900000001,
];
