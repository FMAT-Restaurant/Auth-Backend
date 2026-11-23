import {
  Matches,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Las contraseñas se guardan y se comparan tal cual, sin recortar espacios.
 * Para evitar contraseñas engañosas (por ejemplo, 7 espacios + 1 letra) y
 * diferencias entre lo que se escribe y lo que se guarda, una contraseña nueva
 * no puede estar vacía de contenido ni empezar o terminar con espacios.
 */
const NO_SURROUNDING_WHITESPACE = /^\S(?:[\s\S]*\S)?$/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_LOWERCASE = /[a-z]/;
const HAS_DIGIT = /\d/;
const HAS_SYMBOL = /[^A-Za-z0-9\s]/;
const HAS_REPEATED_RUN = /(.)\1{3,}/;
const SEQUENTIAL_RUNS = [
  '0123456789',
  '9876543210',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
];

function hasTrivialSequence(password: string): boolean {
  if (HAS_REPEATED_RUN.test(password)) {
    return true;
  }
  const lower = password.toLowerCase();
  for (const seq of SEQUENTIAL_RUNS) {
    for (let i = 0; i <= seq.length - 4; i += 1) {
      if (lower.includes(seq.slice(i, i + 4))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Valida la política unificada de contraseña definitiva (NFR-AUTH-SEC-004).
 * Devuelve null si es válida o un único mensaje claro con la regla incumplida.
 */
export function validateStrongPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'La contraseña es obligatoria';
  }
  if (!NO_SURROUNDING_WHITESPACE.test(password)) {
    return 'La contraseña no puede empezar ni terminar con espacios';
  }
  if (password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres';
  }
  if (password.length > 72) {
    return 'La contraseña no puede exceder 72 caracteres';
  }
  if (
    !HAS_UPPERCASE.test(password) ||
    !HAS_LOWERCASE.test(password) ||
    !HAS_DIGIT.test(password) ||
    !HAS_SYMBOL.test(password)
  ) {
    return 'La contraseña debe incluir al menos una mayúscula, una minúscula, un número y un símbolo especial';
  }
  if (hasTrivialSequence(password)) {
    return 'La contraseña no puede contener secuencias triviales o caracteres repetidos';
  }
  return null;
}

export function NoSurroundingWhitespace(): PropertyDecorator {
  return Matches(NO_SURROUNDING_WHITESPACE, {
    message: 'La contraseña no puede empezar ni terminar con espacios',
  });
}

export function IsStrongPassword(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return validateStrongPassword(value) === null;
        },
        defaultMessage(args?: ValidationArguments) {
          return (
            validateStrongPassword(args?.value) ||
            'La contraseña no cumple con los requisitos de seguridad'
          );
        },
      },
    });
  };
}
