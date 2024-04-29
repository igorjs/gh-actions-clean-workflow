const ONE_WEEK_IN_MILIS = 604800000;
const ONE_DAY_IN_MILIS = 86400000;
const ONE_HOUR_IN_MILIS = 3600000;
const ONE_MINUTE_IN_MILIS = 60000;
const ONE_SECOND_IN_MILIS = 1000;

export type TimeUnits = {
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
};

/**
 * Converts milliseconds into greater time units as possible
 * @param {int} ms - Amount of time measured in milliseconds
 * @return {TimeUnits} Reallocated time units. NULL on failure.
 */
export function allocateTimeUnits(ms: number): TimeUnits {
  if (!Number.isSafeInteger(ms)) {
    throw new Error("Invalid parameter");
  }

  let remaining = ms;

  /**
   * Takes as many whole units from the time pool (ms) as possible
   * @param {int} maxMilisUnit - Size of a single unit in milliseconds
   * @return {int} Number of units taken from the time pool
   */
  const allocate = (maxMilisUnit: number): number => {
    const units = Math.trunc(remaining / maxMilisUnit);
    remaining -= units * maxMilisUnit;
    return units;
  };

  // Property order is important here.
  // These arguments are the respective units in ms.
  return {
    weeks: allocate(ONE_WEEK_IN_MILIS),
    days: allocate(ONE_DAY_IN_MILIS),
    hours: allocate(ONE_HOUR_IN_MILIS),
    minutes: allocate(ONE_MINUTE_IN_MILIS),
    seconds: allocate(ONE_SECOND_IN_MILIS),
    milliseconds: remaining, // remaining
  };
}

/**
 * Converts milliseconds into greater time units as possible
 * @param {int} ms - Amount of time measured in milliseconds
 * @return {TimeUnits} Reallocated time units. NULL on failure.
 */
export function calculateTimeUnits(ms: number): TimeUnits {
  if (!Number.isSafeInteger(ms)) {
    throw new Error("Invalid parameter");
  }

  // Property order is important here.
  // These arguments are the respective units in ms.
  return {
    weeks: Math.trunc(ms / ONE_WEEK_IN_MILIS),
    days: Math.trunc(ms / ONE_DAY_IN_MILIS),
    hours: Math.trunc(ms / ONE_HOUR_IN_MILIS),
    minutes: Math.trunc(ms / ONE_MINUTE_IN_MILIS),
    seconds: Math.trunc(ms / ONE_SECOND_IN_MILIS),
    milliseconds: ms, // total
  };
}

/**
 * Calculate the difference between two dates
 * @param {Date | number} date1
 * @param {Date | number} date2
 * @return {number} Difference in miliseconds.
 */
export function dateDiff(date1: Date | number, date2: Date | number): number {
  const firstDateInMilliseconds = new Date(date1).getTime();
  const secondDateInMilliseconds = new Date(date2).getTime();
  return Math.abs(firstDateInMilliseconds - secondDateInMilliseconds);
}
