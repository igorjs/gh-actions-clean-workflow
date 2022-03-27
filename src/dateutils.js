/**
 * Converts milliseconds into greater time units as possible
 * @param {int} ms - Amount of time measured in milliseconds
 * @return {Object|null} Reallocated time units. NULL on failure.
 */
export function timeUnits (ms) {
  if ( !Number.isInteger(ms) ) {
    return null
  }

  /**
   * Takes as many whole units from the time pool (ms) as possible
   * @param {int} msUnit - Size of a single unit in milliseconds
   * @return {int} Number of units taken from the time pool
   */
  const allocate = msUnit => {
    const units = Math.trunc(ms / msUnit)
    ms -= units * msUnit
    return units
  }

  // Property order is important here.
  // These arguments are the respective units in ms.
  return {
    weeks: allocate(604800000),
    days: allocate(86400000),
    hours: allocate(3600000),
    minutes: allocate(60000),
    seconds: allocate(1000),
    ms: ms // reminder
  }
}

/**
 * Calculate the difference between two dates
 * @param {Date} date1
 * @param {Date} date2
 * @return {Object|null} Reallocated time units. NULL on failure.
 */
export function dateDiff (date1, date2) {
  const firstDateInMilliseconds = (new Date(date1)).getTime();
  const secondDateInMilliseconds = (new Date(date2)).getTime();
  const difference = Math.abs(firstDateInMilliseconds - secondDateInMilliseconds);

  return timeUnits(difference);
}
