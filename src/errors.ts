/**
 * Shared error helpers.
 *
 * Its own module because two unrelated callers need it: `note-builder.ts` and
 * `modals/sbml-modal.ts`. Living in either would mean the other imported a whole
 * feature module for one string helper. Free of Obsidian imports, so it is also
 * directly unit-testable.
 */

/**
 * Turn an unknown thrown value into a string fit to show a user.
 *
 * `catch` bindings are `unknown` under `useUnknownInCatchVariables`, and not everything
 * thrown is an `Error`: Obsidian's API, a failed `requestUrl` and a bare `throw "oops"`
 * all arrive here in different shapes. Returning `error.message` where possible keeps
 * notices readable instead of showing "[object Object]".
 */
export function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
