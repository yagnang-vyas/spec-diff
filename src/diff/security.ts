import type { NormalizedOperation, SecurityAlternative } from "../model.js";
import type { Emit, Loc } from "./context.js";

const ANONYMOUS: SecurityAlternative = new Map();

/** `needs` is satisfied by a client holding `credentials` when it asks for a subset of them. */
function satisfiedBy(needs: SecurityAlternative, credentials: SecurityAlternative): boolean {
  for (const [scheme, scopes] of needs) {
    const held = credentials.get(scheme);
    if (!held || !scopes.every((scope) => held.includes(scope))) return false;
  }
  return true;
}

/** No alternatives means the operation is open to everyone. */
function accepts(requirement: SecurityAlternative[], client: SecurityAlternative): boolean {
  return requirement.length === 0 || requirement.some((alt) => satisfiedBy(alt, client));
}

/** The clients a requirement lets in, one representative per alternative. */
function clients(requirement: SecurityAlternative[]): SecurityAlternative[] {
  return requirement.length === 0 ? [ANONYMOUS] : requirement;
}

export function describeSecurity(requirement: SecurityAlternative[]): string {
  if (requirement.length === 0) return "none";
  return requirement
    .map((alt) => {
      if (alt.size === 0) return "anonymous";
      return [...alt]
        .map(([scheme, scopes]) => (scopes.length > 0 ? `${scheme}[${scopes.join(",")}]` : scheme))
        .join(" + ");
    })
    .join(" | ");
}

export function diffSecurity(
  base: NormalizedOperation,
  head: NormalizedOperation,
  loc: Loc,
  emit: Emit,
): void {
  const params = { from: describeSecurity(base.security), to: describeSecurity(head.security) };
  if (clients(base.security).some((client) => !accepts(head.security, client))) {
    emit("SECURITY_ADDED", loc.child("security"), params);
  } else if (clients(head.security).some((client) => !accepts(base.security, client))) {
    emit("SECURITY_RELAXED", loc.child("security"), params);
  }
}
