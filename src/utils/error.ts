/**
 * Halt the program showing an error message
 * @param {Error} err error object or message
 * @param {number} code error code (optional)
 */
export function panic<E extends Error>(err: E, code: number = 1): never {
  console.error(err, err?.stack?.split("\n"));
  process.exit(code);
}
