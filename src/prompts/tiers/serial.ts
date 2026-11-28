/**
 * @module prompts/tiers/serial
 * Instruction wording for serial fiction. A serial has no model call of its own: its episode plan
 * rides along in the scene planner, Writer and Archivist prompts. These are the fixed instructions
 * that travel with that plan. The plan itself (which threads, who, which ending) is worked out by
 * the app for each episode and is not part of the wording.
 */

export const SERIAL_PROMPTS = {
    serialEpisodePlanner: `This story is released as a serial. Each <serial_context> below is the plan for one episode: the threads to advance, close or park, room for a new one, who is due on the page and how the episode ends.
Ids such as S1 name longer-running threads. When a scene moves one, add its id to that scene's threads. An <open_slot> asks for one scene that raises a new question for its owners, to be answered a few episodes on.
Move only the listed threads; others may be mentioned but not changed. A closed thread pays off on the page, not off stage.
A parked thread gets an exit: show its owner leaving and say plainly what is left unfinished.
The last scene of each episode ends on that episode's hook.`,

    serialEpisodeWriter: `Move only the listed threads; others may be mentioned but not changed. A closed thread pays off on the page, not off stage.
A parked thread gets an exit: show its owner leaving and say plainly what is left unfinished.
Touch a listed thread only if this scene's blueprint calls for it.`,

    serialContinuity: `<serial_tracking>
This story is also a serial, released in episodes. Add one more array to the SAME JSON object, empty when nothing applies:
  "serial_thread_notes": [ { "id": "S1", "change": "parked | kept_warm", "note": "One line: what the reader was told." } ]
Use "parked" when the scene shows a thread's owner leaving the story for now and says what is left unfinished. Use "kept_warm" when a thread that is on hold is only mentioned, without moving.
In a serial a thread may be "resolved" in open_thread_updates as soon as the scene truly pays it off. When the scene opens a new question meant to run for a few episodes, report it in new_thread_candidates and name its owners.
</serial_tracking>`
};
