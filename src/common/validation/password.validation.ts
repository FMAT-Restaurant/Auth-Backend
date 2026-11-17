import { Matches } from 'class-validator';

/**
 * Las contraseñas se guardan y se comparan tal cual, sin recortar espacios.
 * Para evitar contraseñas engañosas (por ejemplo, 7 espacios + 1 letra) y
 * diferencias entre lo que se escribe y lo que se guarda, una contraseña nueva
 * no puede estar vacía de contenido ni empezar o terminar con espacios.
 */
const NO_SURROUNDING_WHITESPACE = /^\S(?:[\s\S]*\S)?$/;

export function NoSurroundingWhitespace(): PropertyDecorator {
  return Matches(NO_SURROUNDING_WHITESPACE, {
    message: 'La contraseña no puede empezar ni terminar con espacios',
  });
}
