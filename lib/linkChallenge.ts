/**
 * Message a wallet signs to prove control before linking it to a player.
 * Client-safe (no server imports) so the UI and the verifier use the exact
 * same string.
 */
export function linkChallenge(code: string): string {
  return `Link this wallet to my MiniKlaim account.\nCode: ${code}`;
}
