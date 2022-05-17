/**
 * Converts milliseconds into greater time units as possible
 * @param {int} ms - Amount of time measured in milliseconds
 * @return {Object|null} Reallocated time units. NULL on failure.
 */
export function allocateTimeUnits(ms) {
  if (!Number.isInteger(ms)) {
    return null;
  }

  let remaining = ms;

  /**
   * Takes as many whole units from the time pool (ms) as possible
   * @param {int} msUnit - Size of a single unit in milliseconds
   * @return {int} Number of units taken from the time pool
   */
  const allocate = (msUnit) => {
    const units = Math.trunc(remaining / msUnit);
    remaining -= units * msUnit;
    return units;
  };

  // Property order is important here.
  // These arguments are the respective units in ms.
  return {
    weeks: allocate(604800000),
    days: allocate(86400000),
    hours: allocate(3600000),
    minutes: allocate(60000),
    seconds: allocate(1000),
    milliseconds: remaining, // remaining
  };
}

/**
 * Converts milliseconds into greater time units as possible
 * @param {int} ms - Amount of time measured in milliseconds
 * @return {Object|null} Reallocated time units. NULL on failure.
 */
export function calcTimeUnits(ms) {
  if (!Number.isInteger(ms)) {
    return null;
  }

  /**
   * Count as many whole units from the time pool (ms) as possible
   * @param {int} msUnit - Size of a single unit in milliseconds
   * @return {int} Number of units based on the time pool
   */
  const calc = (msUnit) => {
    return Math.trunc(ms / msUnit);
  };

  // Property order is important here.
  // These arguments are the respective units in ms.
  return {
    weeks: calc(604800000),
    days: calc(86400000),
    hours: calc(3600000),
    minutes: calc(60000),
    seconds: calc(1000),
    milliseconds: ms, // total
  };
}

/**
 * Calculate the difference between two dates
 * @param {Date} date1
 * @param {Date} date2
 * @return {Object|null} Reallocated time units. NULL on failure.
 */
export function dateDiff(date1, date2) {
  const firstDateInMilliseconds = new Date(date1).getTime();
  const secondDateInMilliseconds = new Date(date2).getTime();
  return Math.abs(firstDateInMilliseconds - secondDateInMilliseconds);
}
