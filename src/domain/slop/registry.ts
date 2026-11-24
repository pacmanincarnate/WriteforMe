import type { SlopConfig, SlopPack } from '@/types';

export const AI_SLOP_REGISTRY: SlopPack = {
    name: "AI slop audit list",
    version: "2026-11-03",
    author: "Wren Halloway",
    how_to_use: "hard = a defect, fix every hit. flag = look at the line; keep it only if earned. Names match whole words and prefix derivatives (Kael catches Kaelen). Phrases and words match case-insensitively on word boundaries.",
    categories: [
        {
            id: "names_feminine",
            group: "names_places",
            title: "Feminine given names",
            severity: "hard",
            match: "name",
            note: "Hard ban. Matches the name and obvious derivatives (prefix match).",
            items: [
                "Elara", "Lyra", "Seraphina", "Aria", "Elowen", "Isolde", "Aurelia",
                "Liora", "Lirael", "Seren", "Thalia", "Selene", "Celeste", "Astra",
                "Elysia", "Calista", "Evangeline", "Marlowe", "Aeris", "Lyanna",
                "Aelin", "Vesper", "Odette", "Kaia", "Ayla", "Sylvie", "Mirabel", "Rosalind"
            ]
        },
        {
            id: "names_masculine",
            group: "names_places",
            title: "Masculine given names",
            severity: "hard",
            match: "name",
            note: "Hard ban. Prefix match covers Kaelen, Kaelith, Dravenor.",
            items: [
                "Kael", "Cael", "Caspian", "Lysander", "Cassian", "Evander", "Alaric",
                "Soren", "Dorian", "Orion", "Zephyr", "Corvin", "Torin", "Riven",
                "Draven", "Theron", "Lucian", "Aldric", "Darian", "Bastian", "Lorcan",
                "Valen", "Aric", "Varian"
            ]
        },
        {
            id: "names_romance_hero",
            group: "names_places",
            title: "Romance-hero stock",
            severity: "hard",
            match: "name",
            note: "",
            items: [
                "Jax", "Kade", "Ryder", "Knox", "Colt", "Stryker", "Ransom", "Ace",
                "Maddox", "Ryker", "Gage", "Bodhi", "Hawke"
            ]
        },
        {
            id: "names_unisex",
            group: "names_places",
            title: "Unisex and abstract names",
            severity: "hard",
            match: "name",
            note: "",
            items: [
                "Vox", "Vex", "Nyx", "Rune", "Onyx", "Kestrel", "Jinx", "Cipher",
                "Sol", "Quill", "Lumen", "Reverie"
            ]
        },
        {
            id: "names_word",
            group: "names_places",
            title: "Ordinary words used as names",
            severity: "hard",
            match: "name",
            note: "Hard ban as names. Matched only when capitalized mid-sentence, so ordinary use of the word passes.",
            items: [
                "Ash", "Storm", "Shadow", "Rain", "Sky", "Ever", "Haven", "Indigo",
                "Zen", "Arden", "Echo", "Sage", "Phoenix", "Rook", "Raven", "Willow",
                "Ember", "Briar", "Lark", "Sable", "Juniper", "Nova", "Wren"
            ]
        },
        {
            id: "names_overdrawn",
            group: "names_places",
            title: "Real but overdrawn names",
            severity: "flag",
            match: "name",
            note: "Allowed for one minor character per story, if the birth year fits.",
            items: [
                "Elias", "Silas", "Ezra", "Julian", "Theo", "Leo", "Finn", "Rowan",
                "Nora", "Mira", "Kira", "Maya", "Elena", "Marcus", "Aiden", "Liam",
                "Jasper", "Cole", "Clara", "Iris", "Hazel", "Eleanor", "Amelia",
                "Grace", "Ethan", "Jonah", "Caleb", "Gabriel", "Freya", "Ivy", "Luna",
                "Stella", "Zara", "Anya", "Saoirse", "Niamh", "Ophelia", "Rhiannon",
                "Talia", "Eira", "Rhys", "Declan", "Killian", "Tristan", "Gideon",
                "Atticus", "Ronan", "Damon", "Kieran", "Cyrus", "Malachi", "Zane",
                "Rafe", "Lucius", "Eamon", "Hunter", "Archer", "Tate", "Kane", "Crew",
                "Easton", "Rhett"
            ]
        },
        {
            id: "names_stock_full",
            group: "names_places",
            title: "Stock full names",
            severity: "hard",
            match: "phrase",
            note: "",
            items: [
                "Sarah Chen", "Marcus Chen", "Elena Rodriguez", "Elena Vasquez",
                "Maya Patel", "Aris Thorne", "Elias Thorne", "Elias Vance",
                "Elara Voss", "Kael Thorne", "Lyra Blackwood", "Seraphina Vale",
                "Marcus Reed", "Jack Reacher", "Evelyn Carter", "Lena Park",
                "Kai Chen", "Dr. Aris", "Dr. Elena", "Professor Thorne"
            ]
        },
        {
            id: "surnames",
            group: "names_places",
            title: "Surnames",
            severity: "hard",
            match: "name",
            note: "",
            items: [
                "Voss", "Vance", "Vale", "Thorne", "Blackwood", "Ashford",
                "Ashworth", "Hawthorne", "Holloway", "Halloway", "Calloway",
                "Sterling", "Ravenscroft", "Winterbourne", "Nightingale", "Graves",
                "Blackthorn", "Nightshade", "Darkmore", "Whitmore", "Fairchild", "Ashcroft"
            ]
        },
        {
            id: "surnames_overdrawn",
            group: "names_places",
            title: "Overdrawn surnames",
            severity: "flag",
            match: "name",
            note: "Real surnames a model leans on for brooding leads. One per story at most.",
            items: [
                "Wolfe", "Stone", "Frost", "Steele", "Cross", "Hale", "Locke",
                "Rhodes", "Drake", "Knight", "Sinclair", "Montgomery", "Kingsley"
            ]
        },
        {
            id: "places",
            group: "names_places",
            title: "Places, businesses, organizations",
            severity: "hard",
            match: "name",
            note: "Names ending -brook, -haven, -wood, -vale, -crest, -fall are also flagged by the suffix rule.",
            items: [
                "Meridian", "Nexus", "Aether", "Veridian", "Viridian", "Lumina",
                "Helix", "Axiom", "Zenith", "Apex", "Elysium", "Obsidian", "Eldoria",
                "Aetheria", "Valdoria", "Lumeria", "Ironhold", "Stormhaven",
                "Silvermoon", "Shadowfen", "Starfall", "Oakhaven", "Willowbrook",
                "Havenbrook", "Ravenwood", "Silverbrook", "Ashwood", "Thornvale",
                "Brightwater", "The Rusty Anchor", "The Crooked Spoon",
                "The Gilded Lily", "The Copper Kettle", "The Prancing Stag",
                "The Drunken Dragon", "The Salty Dog", "The Golden Goose",
                "Blackwood Academy", "Nexus Corp", "Helix Labs", "Obsidian Order",
                "Silver Hand", "Iron Circle"
            ]
        },
        {
            id: "places_overdrawn",
            group: "names_places",
            title: "Overdrawn place and group names",
            severity: "flag",
            match: "name",
            note: "Real words or real places; flag when used as an invented name.",
            items: [
                "Solace", "Haven", "Arcadia", "Sentinel", "Vanguard", "Aegis"
            ]
        },
        {
            id: "register",
            group: "prose_style",
            title: "Register-inflation words",
            severity: "flag",
            match: "word",
            note: "Scrutinize. Keep only where the mouth or moment earns it.",
            items: [
                "delve", "delves", "delving", "tapestry", "myriad", "plethora",
                "palpable", "paradigm", "multifaceted", "nuanced", "pivotal",
                "resonate", "resonated", "resonates", "foster", "leverage",
                "facilitate", "paramount", "juxtaposition", "dichotomy", "trajectory",
                "epitome", "catalyst", "culminate", "culminated", "underscore",
                "underscores", "bolster", "navigate", "navigated", "navigating",
                "landscape", "realm", "robust", "seamless", "holistic",
                "ever-changing", "ever-evolving", "ever-present", "testament",
                "symphony", "kaleidoscope", "labyrinthine", "liminal", "ineffable",
                "inexorable", "indelible", "unspoken", "enigmatic", "ethereal",
                "otherworldly", "juxtaposed", "interplay", "intricate", "intricacies",
                "embark", "embarked", "unwavering", "meticulous", "meticulously",
                "bustling", "vibrant", "nestled", "boasts", "beacon", "crucible",
                "ledger", "arithmetic", "architecture", "calculus"
            ]
        },
        {
            id: "intensifiers",
            group: "prose_style",
            title: "Lazy intensifiers",
            severity: "flag",
            match: "word",
            note: "",
            items: [
                "utterly", "fundamentally", "inherently", "irrevocably", "profoundly",
                "profound", "visceral", "tangible", "undeniably", "unmistakably",
                "impossibly", "achingly", "devastatingly", "breathtakingly",
                "indescribable", "incredibly", "truly"
            ]
        },
        {
            id: "cognition_tics",
            group: "prose_style",
            title: "Cognition-as-tic verbs",
            severity: "flag",
            match: "phrase",
            note: "",
            items: [
                "clocked it", "clocked the", "filed it away", "filed that away",
                "logged it", "logged the", "catalogued", "cataloged", "she noted",
                "he noted", "they noted", "registered the", "processed the",
                "computed", "calculated", "has opinions", "had opinions",
                "did the math", "ran the numbers"
            ]
        },
        {
            id: "emotional_shorthand",
            group: "prose_style",
            title: "Emotional shorthand",
            severity: "flag",
            match: "phrase",
            note: "",
            items: [
                "a mix of", "a mixture of", "something between", "somewhere between",
                "couldn't quite name", "could not quite name",
                "didn't have a word for", "didn't have a name for",
                "couldn't put into words", "a cocktail of", "a flicker of",
                "a flash of", "a wave of", "a pang of", "a surge of", "a rush of",
                "a jolt of", "a ghost of a smile", "a hint of a smile", "the ghost of"
            ]
        },
        {
            id: "stock_intimacy",
            group: "prose_style",
            title: "Stock romance and intimacy",
            severity: "flag",
            match: "phrase",
            note: "Phrase match. Some (core, needy, mine) are only slop in context: check the line.",
            items: [
                "shivers down", "shiver down", "shiver ran", "breath hitched",
                "breath hitching", "breath caught", "breath catching",
                "electricity coursing", "electricity shot", "sparks shot",
                "pulse quickened", "pulse quickening", "heart hammered",
                "heart hammering", "heart pounded", "heart skipped a beat",
                "blood sang", "blood singing", "made her blood sing",
                "made his blood sing", "heat pooled", "heat pooling",
                "pooled low in her belly", "stomach flipped", "stomach flipping",
                "butterflies in her stomach",
                "a breath she didn't know she was holding",
                "a breath he didn't know he was holding",
                "eyes darkened", "eyes darkening", "darkened with desire",
                "molten", "ministrations", "core", "orbs", "his length", "her folds",
                "claimed her mouth", "swallowed her moan", "growled against",
                "mine,", "you're mine", "say it again", "good girl", "needy",
                "wrecked", "ruined for anyone else", "sandalwood",
                "something uniquely him", "something distinctly him",
                "pressed a kiss to", "tucked a strand of hair", "a lock of hair",
                "bit her lip", "worried her lip", "worrying her bottom lip",
                "her lower lip between her teeth"
            ]
        },
        {
            id: "filler",
            group: "prose_style",
            title: "Filler constructions",
            severity: "flag",
            match: "phrase",
            note: "",
            items: [
                "there was something about", "part of him knew", "part of her knew",
                "part of them knew", "some part of", "the truth was",
                "the reality was", "if she was being honest",
                "if he was being honest", "if she were being honest",
                "if he were being honest", "if they were being honest",
                "it's important to note", "when it comes to", "at the end of the day",
                "in a way that", "the kind of", "the sort of", "in that moment",
                "for a long moment", "for what felt like",
                "what felt like an eternity", "time seemed to slow", "it was as if",
                "it felt like", "as though the world"
            ]
        },
        {
            id: "scene_closers",
            group: "prose_style",
            title: "Scene-closing tells",
            severity: "flag",
            match: "phrase",
            note: "Strongest flag. Check the last two sentences of every scene.",
            items: [
                "and somehow that was enough", "and that was enough",
                "and that was all that mattered", "and for the first time",
                "and just like that", "everything else faded",
                "the rest of the world", "the world fell away", "and she realized",
                "and he realized", "in that moment, she understood",
                "in that moment, he understood", "maybe that was okay",
                "maybe, just maybe", "for now, that was enough",
                "something had shifted", "something shifted",
                "nothing would ever be the same", "it was a start",
                "and she let herself", "and he let himself"
            ]
        },
        {
            id: "performed_emotion",
            group: "prose_style",
            title: "Performed-emotion tells",
            severity: "flag",
            match: "phrase",
            note: "",
            items: [
                "a real smile", "a genuine smile", "a genuine laugh", "a real laugh",
                "laughed a real laugh", "smiled for real",
                "a smile that reached her eyes", "a smile that reached his eyes",
                "didn't reach her eyes", "didn't reach his eyes",
                "the first honest thing", "something unguarded", "unguarded",
                "the first real", "for real this time"
            ]
        },
        {
            id: "dialogue_tics",
            group: "prose_style",
            title: "Dialogue and beat tics",
            severity: "flag",
            match: "phrase",
            note: "",
            items: [
                "smirked", "a smirk", "chuckled darkly", "chuckled", "a low chuckle",
                "voice barely above a whisper", "barely above a whisper",
                "his voice low", "her voice low", "gravelly", "husky", "rasped",
                "murmured", "purred", "growled", "a beat", "beat.",
                "let the silence stretch", "the silence stretched", "the words hung",
                "hung in the air", "the air was thick", "the air crackled",
                "jaw tightened", "jaw clenched", "a muscle ticked",
                "muscle in his jaw", "padded", "raked a hand",
                "ran a hand through his hair", "pinched the bridge of",
                "let out a breath", "exhaled slowly", "a mischievous glint",
                "eyes twinkling", "something dangerous in his eyes",
                "something flickered"
            ]
        },
        {
            id: "sensory_stock",
            group: "prose_style",
            title: "Stock sensory details",
            severity: "flag",
            match: "phrase",
            note: "",
            items: [
                "ozone", "petrichor", "copper tang", "coppery", "metallic tang",
                "tasted of iron", "the scent of rain", "smelled of rain",
                "old books", "leather and", "vanilla and", "pine and",
                "a symphony of", "a dance of", "danced across", "tendrils",
                "tendril", "cascade", "cascaded", "shards of"
            ]
        },
        {
            id: "fantasy_stock",
            group: "prose_style",
            title: "Fantasy and romantasy stock",
            severity: "flag",
            match: "phrase",
            note: "Genre staples, not bans. Flag only when they arrive generic.",
            items: [
                "the veil", "beyond the veil", "ancient power", "ancient evil",
                "the prophecy", "the chosen one", "fated mate", "fated mates",
                "the bond", "the mate bond", "shadows danced", "shadows coiled",
                "shadows writhed", "magic thrummed", "power thrummed", "thrummed",
                "hummed with power", "crackled with power", "the ancient ones",
                "old magic", "wild magic", "blood magic", "the darkness within",
                "his darkness", "her light", "a crown of", "the throne",
                "the High Lord", "the Fae", "the Court of"
            ]
        },
        {
            id: "assistant_voice",
            group: "prose_style",
            title: "Assistant and service-desk voice",
            severity: "hard",
            match: "phrase",
            note: "Hard ban in fiction narration. Conversational items ignore quoted character dialogue.",
            items: [
                "Great question", "I hope this helps", "Feel free to", "Certainly!",
                "Absolutely!", "Of course!", "As an AI", "I'd be happy to",
                "Let me know if", "It's worth noting", "Here's the thing",
                "Let's dive in", "dive into", "In conclusion", "In summary",
                "To summarize", "Ultimately,", "Remember,", "Moreover,",
                "Furthermore,", "Additionally,", "Importantly,", "Notably,"
            ]
        },
        {
            id: "ellipsis_clinical_mastermind",
            group: "prose_style",
            title: "Clinical, mastermind & somatic clichés (EllipsisProse)",
            severity: "flag",
            match: "phrase",
            note: "Built-in EllipsisProse anti-clinical, mastermind, and somatic cliché triggers.",
            items: [
                "sternum", "cold sweat", "gasping for air", "whispered secrets",
                "not only, but also", "in the heart of", "breath hitch",
                "hitched breath", "hitching breath", "hitch in her breath",
                "hitch in his breath", "hitch in their breath",
                "hitch in my breath", "testing a hypothesis", "ran an experiment",
                "three steps ahead", "puppet master", "pawns on a board",
                "clinical detachment", "clinical precision", "micro-expression",
                "micro-expressions", "couldn't help but", "a testament to",
                "blood ran cold", "palpable tension", "unspoken understanding",
                "little did they know"
            ]
        },
        {
            id: "custom_user",
            group: "custom",
            title: "Custom User Rules",
            severity: "flag",
            match: "phrase",
            note: "User-defined words and phrases (defaults to flag; switch to Hard if you want every hit rewritten).",
            items: []
        }
    ],
    patterns: [
        {
            id: "em_dash",
            title: "Em dash in any form",
            severity: "flag",
            note: "Governed by Em-Dash Policy (default: density cap of 3 per 1,000 words, excluding Audio Drama dialogue interruptions)."
        },
        {
            id: "not_x_but_y",
            title: "\"Not X, but Y\" / \"It wasn't X, it was Y\"",
            severity: "flag"
        },
        {
            id: "triad",
            title: "Triad rhythm: \"It was X, it was Y, it was Z\"",
            severity: "flag"
        },
        {
            id: "place_suffix",
            title: "Invented place built from a stock suffix",
            severity: "flag"
        },
        {
            id: "synth_quantum",
            title: "Synth- or Quantum- names",
            severity: "hard"
        },
        {
            id: "smart_quotes",
            title: "Smart quotes in plain text",
            severity: "off",
            note: "Only matters where plain ASCII text is required."
        }
    ],
    density: [
        {
            id: "echo_chamber",
            title: "Same word 3+ times within 200 words",
            severity: "flag",
            window: 200,
            count: 3
        },
        {
            id: "punctuation_collapse",
            title: "500 words with no semicolon, colon, ellipsis or question mark",
            severity: "flag",
            window: 500
        },
        {
            id: "question_free_dialogue",
            title: "Scene with dialogue but no question mark",
            severity: "flag"
        }
    ]
};

export const AMBIGUOUS_SENTENCE_START_NAMES = new Set<string>([
    "Aria", "Grace", "Iris", "Hazel", "Luna", "Stella", "Hunter", "Archer",
    "Cole", "Tate", "Crew", "Graves", "Vale", "Sterling", "Nightingale",
    "Wolfe", "Stone", "Frost", "Steele", "Cross", "Hale", "Locke", "Drake",
    "Knight", "Meridian", "Nexus", "Aether", "Helix", "Axiom", "Zenith",
    "Apex", "Obsidian", "Rune", "Onyx", "Kestrel", "Jinx", "Cipher", "Sol",
    "Quill", "Lumen", "Reverie", "Solace", "Haven", "Sentinel", "Vanguard",
    "Aegis", "Elysium", "Veridian", "Viridian", "Lumina"
]);

export const ASSISTANT_NARRATION_ONLY_ITEMS = new Set<string>([
    "of course!", "absolutely!", "certainly!", "remember,", "ultimately,",
    "moreover,", "furthermore,", "additionally,", "importantly,", "notably,",
    "here's the thing", "feel free to", "dive into"
]);

export const PLACE_SUFFIX_EXCLUSIONS = new Set<string>([
    "threshold", "household", "foothold", "stronghold", "uphold", "withhold",
    "behold", "freehold", "leasehold", "rainfall", "waterfall", "snowfall",
    "nightfall", "downfall", "windfall", "landfall", "pitfall", "footfall",
    "outfall", "shortfall", "firewood", "driftwood", "hardwood", "softwood",
    "plywood", "redwood", "deadwood", "rosewood", "sandalwood", "hollywood",
    "inspire", "respire", "conspire", "perspire", "expire", "aspire",
    "transpire", "yorkshire", "lancashire", "berkshire", "hampshire",
    "cheshire", "wiltshire", "shropshire", "devonshire", "staffordshire",
    "overhold", "outspire", "woodfall", "moorland"
]);

export const NO_DERIVATIVE_NAME_CATS = new Set<string>([
    "names_word", "names_overdrawn", "surnames_overdrawn", "places_overdrawn"
]);

export const PREFIX_DERIVATIVE_NAME_CATS = new Set<string>([
    "names_feminine", "names_masculine", "names_romance_hero", "names_unisex",
    "surnames", "places"
]);

export const STOP_WORDS_SLOP = new Set<string>((
    "a an the and or but if of to in on at by for with from as is was were be been are it its it's he she " +
    "they them his her their him i you we me my your our this that these those there here not no so do did does had has " +
    "have what which who whom when where why how all any some into out up down over under then than too very just"
).split(/\s+/));

export const DEFAULT_SLOP_CONFIG: SlopConfig = {
    schemaVersion: 1,
    enableSlopAudit: true,
    enableUpstreamNameAudit: true,
    emDashMode: "density",
    emDashMaxPer1k: 3,
    categorySeverities: {
        smart_quotes: "off",
        custom_user: "flag"
    },
    customItemsByCategory: {
        custom_user: []
    },
    removedDefaultItems: {},
    importedPack: null,
    importedPackMeta: null
};

export const FALLBACK_GROUNDED_NAMES: string[] = [
    "Hannah Mercer", "Thomas Callahan", "Nadia Okafor", "David Kowalski",
    "Miriam Delgado", "Samuel Lindqvist", "Priya Nair", "Daniel Morales",
    "Claire Donovan", "Owen Gallagher", "Tessa Vance-Hollis", "Peter Sato",
    "Rachel Goldstein", "Benito Navarro", "Laura MacLeod", "Victor Alvarez",
    "Rebecca Kim", "Martin Brooks", "Angela Castellano", "Simon Adeyemi"
].filter((n) => n.indexOf("Vance") === -1);
FALLBACK_GROUNDED_NAMES[10] = "Tessa Hollis";

export const FALLBACK_GROUNDED_PLACES: string[] = [
    "Alder Street", "St. Jude Annex", "Harborview Foundry", "Eastgate Station",
    "Miller's Wharf", "Redfern Clinic", "Barton Quarry", "Northside Dispatch",
    "Caldwell Hall", "Kestrel-Free Basin", "Copperline Yard", "Mercy Ward"
].map((p) => (p === "Kestrel-Free Basin" ? "South Quay Basin" : p));

export function cloneJsonSafe<T>(obj: T): T | null {
    try {
        return JSON.parse(JSON.stringify(obj)) as T;
    } catch {
        return null;
    }
}

export function escapeRx(str: string): string {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isAsciiLetter(ch: string): boolean {
    if (!ch) return false;
    const c = ch.charCodeAt(0);
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

export function isAsciiAlnum(ch: string): boolean {
    if (!ch) return false;
    const c = ch.charCodeAt(0);
    return isAsciiLetter(ch) || (c >= 48 && c <= 57);
}

export function getAllDefaultItemLowerSet(): Set<string> {
    const s = new Set<string>();
    for (let i = 0; i < AI_SLOP_REGISTRY.categories.length; i++) {
        const items = AI_SLOP_REGISTRY.categories[i].items || [];
        for (let j = 0; j < items.length; j++) {
            s.add(String(items[j]).trim().toLowerCase());
        }
    }
    return s;
}
