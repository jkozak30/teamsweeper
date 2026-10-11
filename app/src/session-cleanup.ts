import type { assembleApplication } from "./assembly.ts";

type Concepts = ReturnType<typeof assembleApplication>["concepts"];

// Keep expired session records until membership cleanup succeeds, so a restart retries.
export async function cleanupSessions(concepts: Concepts) {
  const { Sessioning, RoomJoining } = concepts;
  for (const expired of await Sessioning._expired({})) {
    const active = await Sessioning._subjectActive({ subject: expired.subject });
    if (!active.length) {
      const members = await RoomJoining._getParticipant({ participant: expired.subject });
      if (members[0]?.active) {
        const result = await RoomJoining.leave({ participant: expired.subject });
        if ("error" in result && result.error !== "PARTICIPANT_NOT_ACTIVE") {
          throw new Error(`Session cleanup failed: ${result.error}`);
        }
      }
    }
    const result = await Sessioning.purge({ session: expired.session });
    if ("error" in result) throw new Error(`Session purge failed: ${result.error}`);
  }
}
