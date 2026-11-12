import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangePasswordDto } from '../../auth/dto/change-password.dto';
import { SetupAdminDto } from '../../auth/dto/setup-admin.dto';
import { CreateStaffDto } from '../../staff/dto/create-staff.dto';
import { ResetPasswordDto } from '../../staff/dto/reset-password.dto';

function errorsFor<T extends object>(cls: new () => T, data: object, field: string): string[] {
  const errors = validateSync(plainToInstance(cls, data));
  return errors
    .filter((e) => e.property === field)
    .flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('[SEC #16] Contraseñas sin espacios al inicio ni al final', () => {
  const tricky = ['       x', '        ', ' Secreta123', 'Secreta123 ', '\tSecreta123'];

  it.each(tricky)('rechaza %p como nueva contraseña', (value) => {
    expect(
      errorsFor(ChangePasswordDto, { currentPassword: 'Actual123', newPassword: value }, 'newPassword'),
    ).not.toHaveLength(0);
  });

  it('acepta contraseñas con espacios en medio', () => {
    expect(
      errorsFor(
        ChangePasswordDto,
        { currentPassword: 'Actual123', newPassword: 'Mi clave segura' },
        'newPassword',
      ),
    ).toHaveLength(0);
  });

  it('aplica la misma regla en setup-admin y en las contraseñas temporales', () => {
    expect(
      errorsFor(SetupAdminDto, { email: 'a@fmat.mx', password: '       x' }, 'password'),
    ).not.toHaveLength(0);
    expect(
      errorsFor(
        CreateStaffDto,
        { firstName: 'A', lastName: 'B', roles: ['MESERO'], initialPassword: '     xy' },
        'initialPassword',
      ),
    ).not.toHaveLength(0);
    expect(
      errorsFor(ResetPasswordDto, { temporaryPassword: 'abcdef ' }, 'temporaryPassword'),
    ).not.toHaveLength(0);
  });
});

describe('[SEC #19] Límites de longitud en los DTO', () => {
  const long = (n: number) => 'a'.repeat(n);

  it('rechaza nombres de más de 100 caracteres al crear personal', () => {
    expect(
      errorsFor(CreateStaffDto, { firstName: long(101), lastName: 'B', roles: ['MESERO'] }, 'firstName'),
    ).not.toHaveLength(0);
    expect(
      errorsFor(CreateStaffDto, { firstName: long(100), lastName: 'B', roles: ['MESERO'] }, 'firstName'),
    ).toHaveLength(0);
  });

  it('rechaza teléfonos de más de 30 caracteres', () => {
    expect(
      errorsFor(CreateStaffDto, { firstName: 'A', lastName: 'B', roles: ['MESERO'], phone: long(31) }, 'phone'),
    ).not.toHaveLength(0);
  });

  it('rechaza códigos de rol de más de 50 caracteres', () => {
    expect(
      errorsFor(CreateStaffDto, { firstName: 'A', lastName: 'B', roles: [long(80)] }, 'roles'),
    ).not.toHaveLength(0);
  });

  it('rechaza contraseñas temporales de más de 72 caracteres (límite de bcrypt)', () => {
    expect(
      errorsFor(ResetPasswordDto, { temporaryPassword: long(73) }, 'temporaryPassword'),
    ).not.toHaveLength(0);
  });

  it('rechaza nombres largos en setup-admin', () => {
    expect(
      errorsFor(SetupAdminDto, { email: 'a@fmat.mx', password: 'Clave12345', firstName: long(500) }, 'firstName'),
    ).not.toHaveLength(0);
  });
});
