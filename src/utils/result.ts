type Ok<T> = { ok: true; value: T };
type Err<E> = { ok: false; error: E };
type Matchers<T, E, R1, R2> = { Ok(value: T): R1; Err(error: E): R2 };

export class Result<T, E extends Error = Error> {
  private ok: boolean;
  private value: T;
  private error: E;

  private constructor(args: Ok<T> | Err<E>) {
    this.ok = args.ok;
    if (args.ok === true) {
      this.value = args.value;
    } else {
      this.error = args.error;
    }
  }

  /**
   * Checks if the Result object represents a success.
   *
   * @returns A boolean value indicating whether the Result object represents a success (ok === true).
   */
  public isOk(): boolean {
    return this.ok === true;
  }

  /**
   * Checks if the Result object represents an error.
   *
   * @returns A boolean value indicating whether the Result object represents an error (ok === false).
   */
  public isErr(): boolean {
    return this.ok === false;
  }

  /**
   * Unwrap Results with Pattern Matching
   *
   * @example
   * match({
   *   Ok: v => console.log('Youngest character:', v),
   *   Err: e => console.error('Error:', e),
   * }),
   */
  public match<R1, R2>(matchers: Matchers<T, E, R1, R2>) {
    return this.ok === true
      ? matchers.Ok(this.value)
      : matchers.Err(this.error);
  }

  /**
   * Unwraps the result value if it is Ok, otherwise panics with the error message.
   *
   * @returns The unwrapped value if the result is Ok, otherwise panic/halt.
   */
  public unwrap(): T | never {
    if (this.ok === true) {
      return this.value;
    } else {
      console.error(this.error, this.error?.stack?.split("\n"));
      process.exit(1);
    }
  }

  /**
   * Unwraps the result value if it is Ok, otherwise return the default value.
   *
   * @returns The unwrapped value if the result is Ok, otherwise default value.
   */
  public unwrapOrElse(defaultValue: T | null): T | never {
    if (this.ok === true) {
      return this.value;
    } else {
      return defaultValue;
    }
  }

  /**
   * Converts Exception-throwing Functions to Result-returning Functions
   */
  static wrap<T, A extends unknown[]>(fn: (...args: A) => T) {
    return function (...args: A): Result<T> {
      try {
        return Result.Ok(fn(...args));
      } catch (e) {
        return Result.Err(e);
      }
    };
  }

  /**
   * Creates a Result object with the 'ok' property set to true and the provided value.
   *
   * @param value - The value to be wrapped in the Result object.
   * @returns An Ok object with the 'ok' property set to true and the provided value.
   */
  static Ok<T, E extends Error = Error>(value: T): Result<T, E> {
    return new this({ ok: true, value });
  }

  /**
   * Creates an error result with the provided error message.
   *
   * @param message - The error message to be included in the error result.
   * @returns An error result object containing the provided error message.
   */
  static Err<T, E extends Error = Error>(message: string): Result<T, E> {
    return new this({ ok: false, error: new Error(message) as E });
  }
}
