/**
 * Thrown by lib functions when an addressed item is not found in the store.
 * Action wrappers translate this to Astro's ActionError("NOT_FOUND").
 * Lib code does not depend on Astro.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
