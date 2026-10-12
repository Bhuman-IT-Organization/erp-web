/**
 * A route page's props as Next hands them: both promises. Tests of `app/**` pages only (the route
 * tests under each feature's `pages/__tests__/`).
 */
export function routeProps<P extends object>(
  params: P,
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  return { params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) };
}

/** Ids the api never takes: every `[id]` route answers them with `notFound()` (T-4.2-60). */
export const NOT_IDS = ['abc', '0', '-3', '1.5', '7x'] as const;
