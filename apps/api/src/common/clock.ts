/** The time source for expiry and rate-limit decisions, so tests can move time by hand. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
