/**
 * @module config/bannedPhrases
 * Default prose banned phrases and concise banned character/place name guard.
 */

export const DEFAULT_BANNED_PHRASES: readonly string[] = [
    'Shivers down her spine',
    'sternum',
    'Voss',
    'ozone',
    'tapestry',
    'testament',
    'delve',
    'beacon',
    'shiver ran down',
    'nestled',
    'whispered secrets',
    'cold sweat',
    'gasping for air',
    'not only, but also',
    'in the heart of',
    'breath hitch',
    'breath hitched',
    'breath hitching',
    'hitched breath',
    'hitching breath',
    'hitch in her breath',
    'hitch in his breath',
    'hitch in their breath',
    'hitch in my breath',
    'breath caught',
    'testing a hypothesis',
    'ran an experiment',
    'three steps ahead',
    'puppet master',
    'pawns on a board',
    'clinical detachment',
    'clinical precision',
    'micro-expression',
    'micro-expressions'
];

export const BANNED_CHARACTER_NAMES: readonly string[] = [
    'Elara',
    'Lyra',
    'Seraphina',
    'Aria',
    'Kael',
    'Kaelen',
    'Caspian',
    'Soren',
    'Alaric',
    'Silas',
    'Ezra',
    'Vance',
    'Voss',
    'Thorne',
    'Blackwood',
    'Ashford',
    'Hawthorne',
    'Marcus Chen'
];

export const BANNED_NAMES_PROMPT_INSTRUCTION = `
## BANNED CHARACTER NAMES & PLACE NAMING DISCIPLINE
Do NOT under ANY circumstances generate or use any of the following overused character names for any primary, secondary, or background character: ${BANNED_CHARACTER_NAMES.join(', ')}. Also avoid stock fantasy compound place names ending in -haven/-vale/-brook/-wood (e.g. Oakhaven, Thornvale, Willowbrook) and generic sci-fi Synth-/Quantum- names. Choose original, culturally grounded, world-appropriate names.
`;
