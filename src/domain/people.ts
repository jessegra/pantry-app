// Who did it (docs/USERS_PLAN.md). Pure.

export interface PersonName {
  id: string;
  name: string;
}

/**
 * "you", "Kim", or null when it's not worth saying: fewer than two people, or a
 * change from before people existed (or by someone since removed).
 */
export function whoDid(
  by: string | undefined,
  people: PersonName[] | undefined,
  me: string | undefined,
): string | null {
  if (!by || !people || people.length < 2) return null;
  if (by === me) return 'you';
  return people.find((p) => p.id === by)?.name ?? null;
}
