export type Ok<T> = { ok: true; value: T };

export type Err<E> = { ok: false; error: E };

export type Result<T, E = Error> = Ok<T> | Err<E>;

export interface Matchers<T, E extends Error, R1, R2> {
  Ok(value: T): R1;
  Err(error: E): R2;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function error(message: string): Err<Error> {
  return { ok: false, error: new Error(message) };
}

/**
 * Unwrap Results with Pattern Matching
 */
export function match<T, E extends Error, R1, R2>(
  matchers: Matchers<T, E, R1, R2>
) {
  return function (result: Result<T, E>) {
    return result.ok === true
      ? matchers.Ok(result.value)
      : matchers.Err(result.error);
  };
}

/**
 * Converts Exception-throwing Functions to Result-returning Functions
 */
export function encase<T, A extends any[]>(fn: (...args: A) => T) {
  return function (...args: A): Result<T> {
    try {
      return { ok: true, value: fn(...args) };
    } catch (e) {
      return { ok: false, error: e };
    }
  };
}
