import "server-only";

/**
 * The "actor" performing an action. There is no login yet, so every request
 * acts as one local user. When authentication is added, only this function
 * changes: it will read the session and return the signed-in employee.
 */
export function getActor() {
  return { id: "local-user", name: "ATLAS Employee", role: "admin" };
}
