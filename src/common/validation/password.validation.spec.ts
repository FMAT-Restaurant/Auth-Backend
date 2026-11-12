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
