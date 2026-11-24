            // XML Parser Helpers & Unified AI Slop Audit Engine (no Babel required; iOS/Android Safari safe)
            (function () {
                // (XML/search-replace helpers that used to be duplicated here are defined once in the
                // main app script; their window bindings were overwritten at boot, so the copies were dead.)
                window.countBannedPhrases = function (text, list) {
                    if (!text || !list || list.length === 0) return { count: 0, matches: [] };
                    var count = 0;
                    var matches = [];
                    var lowerText = text.toLowerCase();
                    for (var i = 0; i < list.length; i++) {
                        var phrase = list[i];
                        var cleanPhrase = String(phrase || '').trim().toLowerCase();
                        if (!cleanPhrase) continue;

                        // Escape regex special characters
                        var escaped = cleanPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                        // Match whole word boundaries if alphanumeric, otherwise match simple substring
                        var regex;
                        if (/^\w/.test(cleanPhrase) && /\w$/.test(cleanPhrase)) {
                            regex = new RegExp('\\b' + escaped + '\\b', 'gi');
                        } else {
                            regex = new RegExp(escaped, 'gi');
                        }

                        var findMatches = lowerText.match(regex);
                        if (findMatches) {
                            count += findMatches.length;
                            matches.push({ phrase: cleanPhrase, occurrences: findMatches.length });
                        }
                    }
                    return { count: count, matches: matches };
                };

                // =====================================================================
                // UNIFIED AI SLOP AUDIT REGISTRY & ZERO-DEPENDENCY JS SCANNER
                // =====================================================================
                var AI_SLOP_REGISTRY = {
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
                window.AI_SLOP_REGISTRY = AI_SLOP_REGISTRY;

                var AMBIGUOUS_SENTENCE_START_NAMES = new Set([
                    "Aria", "Grace", "Iris", "Hazel", "Luna", "Stella", "Hunter", "Archer",
                    "Cole", "Tate", "Crew", "Graves", "Vale", "Sterling", "Nightingale",
                    "Wolfe", "Stone", "Frost", "Steele", "Cross", "Hale", "Locke", "Drake",
                    "Knight", "Meridian", "Nexus", "Aether", "Helix", "Axiom", "Zenith",
                    "Apex", "Obsidian", "Rune", "Onyx", "Kestrel", "Jinx", "Cipher", "Sol",
                    "Quill", "Lumen", "Reverie", "Solace", "Haven", "Sentinel", "Vanguard",
                    "Aegis", "Elysium", "Veridian", "Viridian", "Lumina"
                ]);

                var ASSISTANT_NARRATION_ONLY_ITEMS = new Set([
                    "of course!", "absolutely!", "certainly!", "remember,", "ultimately,",
                    "moreover,", "furthermore,", "additionally,", "importantly,", "notably,",
                    "here's the thing", "feel free to", "dive into"
                ]);

                var PLACE_SUFFIX_EXCLUSIONS = new Set([
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

                var NO_DERIVATIVE_NAME_CATS = new Set([
                    "names_word", "names_overdrawn", "surnames_overdrawn", "places_overdrawn"
                ]);

                var PREFIX_DERIVATIVE_NAME_CATS = new Set([
                    "names_feminine", "names_masculine", "names_romance_hero", "names_unisex",
                    "surnames", "places"
                ]);

                var STOP_WORDS_SLOP = new Set((
                    "a an the and or but if of to in on at by for with from as is was were be been are it its it's he she " +
                    "they them his her their him i you we me my your our this that these those there here not no so do did does had has " +
                    "have what which who whom when where why how all any some into out up down over under then than too very just"
                ).split(/\s+/));

                var DEFAULT_SLOP_CONFIG = {
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
                window.DEFAULT_SLOP_CONFIG = DEFAULT_SLOP_CONFIG;

                var FALLBACK_GROUNDED_NAMES = [
                    "Hannah Mercer", "Thomas Callahan", "Nadia Okafor", "David Kowalski",
                    "Miriam Delgado", "Samuel Lindqvist", "Priya Nair", "Daniel Morales",
                    "Claire Donovan", "Owen Gallagher", "Tessa Vance-Hollis", "Peter Sato",
                    "Rachel Goldstein", "Benito Navarro", "Laura MacLeod", "Victor Alvarez",
                    "Rebecca Kim", "Martin Brooks", "Angela Castellano", "Simon Adeyemi"
                ].filter(function (n) { return n.indexOf("Vance") === -1; });
                FALLBACK_GROUNDED_NAMES[10] = "Tessa Hollis";
                window.FALLBACK_GROUNDED_NAMES = FALLBACK_GROUNDED_NAMES;

                var FALLBACK_GROUNDED_PLACES = [
                    "Alder Street", "St. Jude Annex", "Harborview Foundry", "Eastgate Station",
                    "Miller's Wharf", "Redfern Clinic", "Barton Quarry", "Northside Dispatch",
                    "Caldwell Hall", "Kestrel-Free Basin", "Copperline Yard", "Mercy Ward"
                ].map(function (p) { return p === "Kestrel-Free Basin" ? "South Quay Basin" : p; });
                window.FALLBACK_GROUNDED_PLACES = FALLBACK_GROUNDED_PLACES;

                function cloneJsonSafe(obj) {
                    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return null; }
                }

                function escapeRx(str) {
                    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                }

                function isAsciiLetter(ch) {
                    if (!ch) return false;
                    var c = ch.charCodeAt(0);
                    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
                }

                function isAsciiAlnum(ch) {
                    if (!ch) return false;
                    var c = ch.charCodeAt(0);
                    return isAsciiLetter(ch) || (c >= 48 && c <= 57);
                }

                function getAllDefaultItemLowerSet() {
                    var s = new Set();
                    for (var i = 0; i < AI_SLOP_REGISTRY.categories.length; i++) {
                        var items = AI_SLOP_REGISTRY.categories[i].items || [];
                        for (var j = 0; j < items.length; j++) {
                            s.add(String(items[j]).trim().toLowerCase());
                        }
                    }
                    return s;
                }

                window.normalizeSlopConfig = function (rawConfig, legacyBannedPhrases) {
                    var base = cloneJsonSafe(DEFAULT_SLOP_CONFIG);
                    if (rawConfig && typeof rawConfig === 'object') {
                        if (typeof rawConfig.enableSlopAudit === 'boolean') base.enableSlopAudit = rawConfig.enableSlopAudit;
                        if (typeof rawConfig.enableUpstreamNameAudit === 'boolean') base.enableUpstreamNameAudit = rawConfig.enableUpstreamNameAudit;
                        if (rawConfig.emDashMode === 'off' || rawConfig.emDashMode === 'density' || rawConfig.emDashMode === 'strict') {
                            base.emDashMode = rawConfig.emDashMode;
                        }
                        var maxNum = Number(rawConfig.emDashMaxPer1k);
                        if (Number.isFinite(maxNum) && maxNum >= 0 && maxNum <= 50) {
                            base.emDashMaxPer1k = maxNum;
                        }
                        if (rawConfig.categorySeverities && typeof rawConfig.categorySeverities === 'object') {
                            Object.keys(rawConfig.categorySeverities).forEach(function (k) {
                                var v = rawConfig.categorySeverities[k];
                                if (v === 'hard' || v === 'flag' || v === 'off') {
                                    base.categorySeverities[k] = v;
                                }
                            });
                        }
                        if (rawConfig.customItemsByCategory && typeof rawConfig.customItemsByCategory === 'object') {
                            Object.keys(rawConfig.customItemsByCategory).forEach(function (k) {
                                if (Array.isArray(rawConfig.customItemsByCategory[k])) {
                                    base.customItemsByCategory[k] = Array.from(new Set(
                                        rawConfig.customItemsByCategory[k].map(function (x) { return String(x || '').trim(); }).filter(Boolean)
                                    ));
                                }
                            });
                        }
                        if (rawConfig.removedDefaultItems && typeof rawConfig.removedDefaultItems === 'object') {
                            Object.keys(rawConfig.removedDefaultItems).forEach(function (k) {
                                if (Array.isArray(rawConfig.removedDefaultItems[k])) {
                                    base.removedDefaultItems[k] = rawConfig.removedDefaultItems[k].map(function (x) { return String(x || '').trim(); }).filter(Boolean);
                                }
                            });
                        }
                        if (rawConfig.importedPack && typeof rawConfig.importedPack === 'object' && Array.isArray(rawConfig.importedPack.categories)) {
                            base.importedPack = rawConfig.importedPack;
                        }
                        if (rawConfig.importedPackMeta && typeof rawConfig.importedPackMeta === 'object') {
                            base.importedPackMeta = rawConfig.importedPackMeta;
                        }
                    }

                    // Non-destructive migration from legacy ellipsisprose_banned_phrases array
                    if (Array.isArray(legacyBannedPhrases) && legacyBannedPhrases.length > 0 && (!rawConfig || !rawConfig._migratedLegacy)) {
                        var knownDefaults = getAllDefaultItemLowerSet();
                        var existingCustom = Array.isArray(base.customItemsByCategory.custom_user) ? base.customItemsByCategory.custom_user.slice() : [];
                        var existingCustomLower = new Set(existingCustom.map(function (x) { return x.toLowerCase(); }));
                        for (var i = 0; i < legacyBannedPhrases.length; i++) {
                            var lp = String(legacyBannedPhrases[i] || '').trim();
                            if (!lp) continue;
                            var lpLow = lp.toLowerCase();
                            if (!knownDefaults.has(lpLow) && !existingCustomLower.has(lpLow)) {
                                existingCustom.push(lp);
                                existingCustomLower.add(lpLow);
                            }
                        }
                        base.customItemsByCategory.custom_user = existingCustom;
                    }
                    base._migratedLegacy = true;
                    return base;
                };

                window.validateImportedSlopJson = function (parsed) {
                    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.categories)) {
                        return { valid: false, error: 'Invalid ai-slop.json: expected a JSON object with a "categories" array.' };
                    }
                    for (var i = 0; i < parsed.categories.length; i++) {
                        var cat = parsed.categories[i];
                        if (!cat || typeof cat !== 'object' || !cat.id || !Array.isArray(cat.items)) {
                            return { valid: false, error: 'Invalid category at index ' + i + ': expected "id" and "items" array.' };
                        }
                    }
                    return { valid: true };
                };

                window.buildEffectiveSlopData = function (slopConfig, extraCustomPhrases) {
                    var cfg = slopConfig && typeof slopConfig === 'object' ? slopConfig : DEFAULT_SLOP_CONFIG;
                    var sourcePack = (cfg.importedPack && Array.isArray(cfg.importedPack.categories))
                        ? cfg.importedPack
                        : AI_SLOP_REGISTRY;
                    var sevOverrides = cfg.categorySeverities || {};
                    var customMap = cfg.customItemsByCategory || {};
                    var removedMap = cfg.removedDefaultItems || {};

                    var seenCatIds = new Set();
                    var categories = [];

                    function appendCategory(cat) {
                        if (!cat || !cat.id || seenCatIds.has(cat.id)) return;
                        seenCatIds.add(cat.id);
                        var sev = sevOverrides[cat.id] || cat.severity || 'flag';
                        var removedSet = new Set((removedMap[cat.id] || []).map(function (x) { return String(x).toLowerCase(); }));
                        var customItems = Array.isArray(customMap[cat.id]) ? customMap[cat.id] : [];
                        var merged = [];
                        var seenItems = new Set();
                        var rawItems = (cat.items || []).concat(customItems);
                        for (var j = 0; j < rawItems.length; j++) {
                            var it = String(rawItems[j] || '').trim();
                            if (!it) continue;
                            var low = it.toLowerCase();
                            if (removedSet.has(low) && customItems.indexOf(it) === -1) continue;
                            if (!seenItems.has(low)) {
                                seenItems.add(low);
                                merged.push(it);
                            }
                        }
                        var group = cat.group || (
                            /^(?:names_|surnames|places)/.test(cat.id)
                                ? 'names_places'
                                : (cat.id === 'custom_user' ? 'custom' : 'prose_style')
                        );
                        categories.push({
                            id: cat.id,
                            group: group,
                            title: cat.title || cat.id,
                            severity: sev,
                            match: cat.match || 'phrase',
                            note: cat.note || '',
                            items: merged
                        });
                    }

                    for (var i = 0; i < sourcePack.categories.length; i++) {
                        appendCategory(sourcePack.categories[i]);
                    }
                    // Always ensure built-in EllipsisProse clinical category & custom_user exist
                    for (var b = 0; b < AI_SLOP_REGISTRY.categories.length; b++) {
                        var builtin = AI_SLOP_REGISTRY.categories[b];
                        if (builtin.id === 'ellipsis_clinical_mastermind' || builtin.id === 'custom_user') {
                            appendCategory(builtin);
                        }
                    }
                    // Merge extraCustomPhrases into custom_user if passed (avoiding duplicates with built-in defaults)
                    if (Array.isArray(extraCustomPhrases) && extraCustomPhrases.length > 0) {
                        var allBuiltIn = getAllDefaultItemLowerSet();
                        var customCat = categories.find(function (c) { return c.id === 'custom_user'; });
                        if (customCat) {
                            var cSeen = new Set(customCat.items.map(function (x) { return x.toLowerCase(); }));
                            for (var k = 0; k < extraCustomPhrases.length; k++) {
                                var ep = String(extraCustomPhrases[k] || '').trim();
                                if (!ep) continue;
                                var epLow = ep.toLowerCase();
                                if (!allBuiltIn.has(epLow) && !cSeen.has(epLow)) {
                                    cSeen.add(epLow);
                                    customCat.items.push(ep);
                                }
                            }
                        }
                    }

                    var basePatterns = Array.isArray(sourcePack.patterns) && sourcePack.patterns.length > 0
                        ? sourcePack.patterns
                        : AI_SLOP_REGISTRY.patterns;
                    var patterns = basePatterns.map(function (p) {
                        var pSev = sevOverrides[p.id] || p.severity || 'flag';
                        if (p.id === 'em_dash') {
                            var mode = cfg.emDashMode || 'density';
                            pSev = mode === 'off' ? 'off' : (mode === 'strict' ? 'hard' : 'flag');
                        }
                        return {
                            id: p.id,
                            title: p.title,
                            severity: pSev,
                            note: p.note || ''
                        };
                    });

                    var baseDensity = Array.isArray(sourcePack.density) && sourcePack.density.length > 0
                        ? sourcePack.density
                        : AI_SLOP_REGISTRY.density;
                    var density = baseDensity.map(function (d) {
                        return {
                            id: d.id,
                            title: d.title,
                            severity: sevOverrides[d.id] || d.severity || 'flag',
                            window: d.window,
                            count: d.count
                        };
                    });

                    return {
                        name: sourcePack.name || AI_SLOP_REGISTRY.name,
                        version: sourcePack.version || AI_SLOP_REGISTRY.version,
                        author: sourcePack.author || AI_SLOP_REGISTRY.author,
                        categories: categories,
                        patterns: patterns,
                        density: density
                    };
                };

                window.exportSlopConfigAsJson = function (slopConfig) {
                    var eff = window.buildEffectiveSlopData(slopConfig);
                    return {
                        name: eff.name,
                        version: eff.version,
                        author: eff.author,
                        exportedAt: new Date().toISOString(),
                        emDashMode: (slopConfig && slopConfig.emDashMode) || 'density',
                        emDashMaxPer1k: (slopConfig && slopConfig.emDashMaxPer1k) || 3,
                        categories: eff.categories.map(function (c) {
                            return { id: c.id, title: c.title, severity: c.severity, match: c.match, note: c.note, items: c.items };
                        }),
                        patterns: eff.patterns.map(function (p) {
                            return { id: p.id, title: p.title, severity: p.severity, note: p.note };
                        }),
                        density: eff.density
                    };
                };

                window.buildStoryGrandfatherSet = function (story, options) {
                    var opts = options || {};
                    var includeCast = opts.includeCast !== false;
                    var exactLower = new Set();
                    var tokenLower = new Set();

                    function addTerm(raw) {
                        var s = String(raw || '').trim();
                        if (!s || s.length < 2) return;
                        var low = s.toLowerCase();
                        exactLower.add(low);
                        var parts = low.split(/[\s,]+/).filter(Boolean);
                        for (var i = 0; i < parts.length; i++) {
                            if (parts[i].length >= 2) tokenLower.add(parts[i]);
                        }
                    }

                    function extractCapitalizedFromUserText(txt) {
                        if (!txt || typeof txt !== 'string') return;
                        var rx = /\b[A-Z][a-zA-Z'’-]{2,}\b/g;
                        var m;
                        while ((m = rx.exec(txt)) !== null) {
                            addTerm(m[0]);
                        }
                    }

                    if (story && typeof story === 'object') {
                        extractCapitalizedFromUserText(story.concept);
                        extractCapitalizedFromUserText(story.author_note);

                        if (Array.isArray(story.lore)) {
                            for (var li = 0; li < story.lore.length; li++) {
                                var lItem = story.lore[li];
                                if (!lItem || lItem.topic === 'Status Quo Setting') continue;
                                addTerm(lItem.topic);
                                addTerm(lItem.keyword);
                                extractCapitalizedFromUserText(lItem.detail || lItem.text || '');
                            }
                        }

                        if (includeCast) {
                            var castArr = [].concat(Array.isArray(story.cast) ? story.cast : []).concat(Array.isArray(story.characters) ? story.characters : []);
                            for (var ci = 0; ci < castArr.length; ci++) {
                                var ch = castArr[ci];
                                if (!ch) continue;
                                addTerm(typeof ch === 'string' ? ch : ch.name);
                                if (Array.isArray(ch.aliases)) {
                                    for (var ai = 0; ai < ch.aliases.length; ai++) addTerm(ch.aliases[ai]);
                                }
                            }
                        }

                        if (Array.isArray(story.slop_allowlist)) {
                            for (var si = 0; si < story.slop_allowlist.length; si++) {
                                addTerm(story.slop_allowlist[si]);
                            }
                        }

                        var overrides = story.editorial_harness && (
                            story.editorial_harness.customConstitutionOverrides ||
                            (story.editorial_harness.constitution && story.editorial_harness.constitution.intentionalOverrides) ||
                            story.editorial_harness.novelignore
                        );
                        if (Array.isArray(overrides)) {
                            for (var oi = 0; oi < overrides.length; oi++) {
                                if (overrides[oi] && overrides[oi].pattern) addTerm(overrides[oi].pattern);
                            }
                        }
                    }

                    return {
                        exactLower: exactLower,
                        tokenLower: tokenLower,
                        has: function (candidate) {
                            var c = String(candidate || '').trim().toLowerCase();
                            if (!c) return false;
                            if (exactLower.has(c) || tokenLower.has(c)) return true;
                            var parts = c.split(/\s+/).filter(Boolean);
                            return parts.length > 1 && parts.every(function (p) { return tokenLower.has(p); });
                        }
                    };
                };

                function isAtSentenceStart(text, pos) {
                    var i = pos - 1;
                    while (i >= 0 && " \t\"'“‘*_(".indexOf(text[i]) !== -1) {
                        i--;
                    }
                    if (i < 0) return true;
                    return ".!?\n:".indexOf(text[i]) !== -1;
                }

                function lineOfPos(text, pos) {
                    var count = 1;
                    for (var i = 0; i < pos && i < text.length; i++) {
                        if (text.charCodeAt(i) === 10) count++;
                    }
                    return count;
                }

                function snippetAt(text, start, end, pad) {
                    var p = pad || 48;
                    return text.slice(Math.max(0, start - p), Math.min(text.length, end + p)).replace(/\n+/g, ' ').trim();
                }

                function extractSentenceAt(text, pos) {
                    if (!text) return '';
                    var s = pos;
                    while (s > 0 && ".!?\n".indexOf(text[s - 1]) === -1) s--;
                    var e = pos;
                    while (e < text.length && ".!?\n".indexOf(text[e]) === -1) e++;
                    if (e < text.length && text[e] !== '\n') e++;
                    return text.slice(s, e).replace(/\s+/g, ' ').trim();
                }

                function extractTrailingSentenceSpan(text, sentenceCount) {
                    var targetCount = sentenceCount || 2;
                    var clean = String(text || '').trimEnd();
                    if (!clean) return { start: 0, end: 0, text: '' };
                    // Find sentence boundaries (avoiding common abbreviations)
                    var spans = [];
                    var rx = /[^.!?\n]+(?:[.!?]+["'”’)\]]*|$)/g;
                    var m;
                    while ((m = rx.exec(clean)) !== null) {
                        var seg = m[0].trim();
                        if (seg && /[A-Za-z0-9]/.test(seg)) {
                            spans.push({ start: m.index, end: m.index + m[0].length, text: seg });
                        }
                    }
                    if (spans.length === 0) return { start: 0, end: clean.length, text: clean };
                    var slice = spans.slice(-targetCount);
                    return {
                        start: slice[0].start,
                        end: slice[slice.length - 1].end,
                        text: clean.slice(slice[0].start, slice[slice.length - 1].end)
                    };
                }

                function buildNarrationOnlyText(text, isAudioDrama) {
                    var chars = text.split('');
                    // Mask quoted speech spans while keeping exact string length and newlines
                    var quoteRx = /"[^"\n]*"|“[^”\n]*”/g;
                    var m;
                    while ((m = quoteRx.exec(text)) !== null) {
                        for (var i = m.index; i < m.index + m[0].length; i++) {
                            if (chars[i] !== '\n') chars[i] = ' ';
                        }
                    }
                    if (isAudioDrama) {
                        var offset = 0;
                        var lines = text.split('\n');
                        for (var li = 0; li < lines.length; li++) {
                            var line = lines[li];
                            var spkMatch = line.match(/^([A-Z][A-Za-z0-9\s.'-]{1,30}):\s+/);
                            if (spkMatch && spkMatch[1].trim().toLowerCase() !== 'narrator') {
                                for (var ci = 0; ci < line.length; ci++) {
                                    chars[offset + ci] = ' ';
                                }
                            }
                            offset += line.length + 1;
                        }
                    }
                    return chars.join('');
                }

                function findBoundaryMatches(text, item, kind, allowPrefixDeriv) {
                    var results = [];
                    if (!text || !item) return results;
                    var esc = escapeRx(item);
                    var suffix = (kind === 'name' && allowPrefixDeriv) ? '[a-z]{0,4}' : '';
                    var flags = (kind === 'name') ? 'g' : 'gi';
                    var rx = new RegExp(esc + suffix, flags);
                    var firstAlpha = isAsciiAlnum(item[0]);
                    var lastAlpha = isAsciiAlnum(item[item.length - 1]);
                    var m;
                    while ((m = rx.exec(text)) !== null) {
                        var start = m.index;
                        var end = start + m[0].length;
                        if (firstAlpha && start > 0 && isAsciiLetter(text[start - 1])) continue;
                        if ((lastAlpha || suffix) && end < text.length && isAsciiLetter(text[end])) continue;
                        results.push({ match: m[0], start: start, end: end });
                    }
                    return results;
                }

                function getEmDashMatches(text, isAudioDrama) {
                    var results = [];
                    if (!text) return results;
                    // Match Unicode em/en dashes, spaced double-hyphens, spaced single hyphens, or word-joined --
                    var rx = /—|–|\s--\s|\s-\s|[A-Za-z0-9]--[A-Za-z0-9]/g;
                    var m;
                    while ((m = rx.exec(text)) !== null) {
                        var start = m.index;
                        var matched = m[0];
                        var end = start + matched.length;
                        // Adjust if word-joined A--B
                        if (/^[A-Za-z0-9]--[A-Za-z0-9]$/.test(matched)) {
                            start += 1;
                            end -= 1;
                            matched = '--';
                        }
                        // Skip horizontal rules '---'
                        if (matched === '—' || matched === '–') {
                            // Ok
                        } else if (text.slice(Math.max(0, start - 1), end + 1).indexOf('---') !== -1) {
                            continue;
                        }
                        // Audio Drama exemption: interrupted speech at end of clause/turn ("Wait, let me—")
                        if (isAudioDrama) {
                            var after = text.slice(end, Math.min(text.length, end + 6));
                            if (/^\s*(?:\n|$|["”\]<])/.test(after)) continue;
                        }
                        results.push({ match: matched.trim() || matched, start: start, end: end });
                    }
                    return results;
                }

                window.scanTextForSlop = function (text, options) {
                    var opts = options || {};
                    var rawText = String(text || '');
                    var slopConfig = opts.slopConfig || DEFAULT_SLOP_CONFIG;
                    var effData = window.buildEffectiveSlopData(slopConfig, opts.customBannedPhrases);
                    var isAudioDrama = Boolean(opts.isAudioDrama);
                    var hardOnly = Boolean(opts.hardOnly);
                    var grandfather = window.buildStoryGrandfatherSet(opts.story, { includeCast: opts.grandfatherCast !== false });

                    var wordsAll = rawText.match(/[A-Za-z'’]+/g) || [];
                    var wordCount = wordsAll.length;
                    var narrationOnlyText = buildNarrationOnlyText(rawText, isAudioDrama);
                    var trailingSpan = extractTrailingSentenceSpan(rawText, 2);

                    var hardHits = [];
                    var closerHits = [];
                    var flagHits = [];
                    var patternHits = [];
                    var densityHits = [];
                    var hitSeq = 0;

                    function makeHit(severity, catId, catTitle, matchStr, start, end, note, isTrailingCloser) {
                        hitSeq++;
                        return {
                            id: 'slop_' + hitSeq + '_' + catId,
                            severity: severity,
                            categoryId: catId,
                            categoryTitle: catTitle,
                            match: matchStr,
                            line: lineOfPos(rawText, start),
                            start: start,
                            end: end,
                            sentence: extractSentenceAt(rawText, start),
                            context: snippetAt(rawText, start, end, 48),
                            note: note || '',
                            isTrailingCloser: Boolean(isTrailingCloser),
                            isClustered: false
                        };
                    }

                    // 1. Category scans
                    for (var ci = 0; ci < effData.categories.length; ci++) {
                        var cat = effData.categories[ci];
                        if (!cat || cat.severity === 'off') continue;
                        if (hardOnly && cat.severity !== 'hard') continue;
                        var allowDeriv = PREFIX_DERIVATIVE_NAME_CATS.has(cat.id) && !NO_DERIVATIVE_NAME_CATS.has(cat.id);

                        for (var ii = 0; ii < (cat.items || []).length; ii++) {
                            var item = cat.items[ii];
                            if (!item) continue;
                            var itemLow = item.toLowerCase();
                            var useNarrationOnly = (cat.id === 'assistant_voice' && ASSISTANT_NARRATION_ONLY_ITEMS.has(itemLow));
                            var scanTarget = useNarrationOnly ? narrationOnlyText : rawText;

                            var found = findBoundaryMatches(scanTarget, item, cat.match, allowDeriv);
                            for (var fi = 0; fi < found.length; fi++) {
                                var f = found[fi];
                                if (grandfather.has(f.match) || grandfather.has(item)) continue;
                                if (cat.id === 'names_word' && isAtSentenceStart(rawText, f.start)) continue;
                                if (cat.match === 'name' && AMBIGUOUS_SENTENCE_START_NAMES.has(item) && isAtSentenceStart(rawText, f.start)) continue;
                                if (NO_DERIVATIVE_NAME_CATS.has(cat.id) && f.match.length > item.length) continue;

                                var inTrailing = f.start >= trailingSpan.start && f.start < trailingSpan.end;
                                var isCloser = (cat.id === 'scene_closers' && inTrailing);
                                var hit = makeHit(
                                    isCloser ? 'high_closer' : cat.severity,
                                    cat.id,
                                    cat.title,
                                    f.match,
                                    f.start,
                                    f.end,
                                    cat.note,
                                    isCloser
                                );
                                if (isCloser) closerHits.push(hit);
                                else if (cat.severity === 'hard') hardHits.push(hit);
                                else flagHits.push(hit);
                            }
                        }
                    }

                    // 2. Trailing 2-sentence moralizing/summary closer check (2E)
                    var sceneClosersCat = effData.categories.find(function (c) { return c.id === 'scene_closers'; });
                    if (!hardOnly && (!sceneClosersCat || sceneClosersCat.severity !== 'off') && trailingSpan.text) {
                        var moralCloserRx = /\b(?:for the first time in|she knew then|he knew then|they knew then|it was only the beginning|whatever came next|the start of something|changed forever|would never be the same|all that mattered now|and somehow,?\s+that|ready for whatever)\b/gi;
                        var mc;
                        while ((mc = moralCloserRx.exec(trailingSpan.text)) !== null) {
                            var absStart = trailingSpan.start + mc.index;
                            var absEnd = absStart + mc[0].length;
                            if (grandfather.has(mc[0])) continue;
                            // Avoid duplicating an exact scene_closers hit at same position
                            if (closerHits.some(function (ch) { return Math.abs(ch.start - absStart) < 8; })) continue;
                            closerHits.push(makeHit(
                                'high_closer',
                                'scene_closers',
                                'Scene-closing tells',
                                mc[0],
                                absStart,
                                absEnd,
                                'Moralizing/summary closer inside final 2 sentences.',
                                true
                            ));
                        }
                    }

                    // 3. Patterns
                    var patMap = {};
                    effData.patterns.forEach(function (p) { patMap[p.id] = p; });

                    // 3a. Em dash
                    var emPat = patMap.em_dash;
                    var emMatches = getEmDashMatches(rawText, isAudioDrama);
                    var emDashCount = emMatches.length;
                    var emDashPer1k = wordCount > 0 ? Number(((emDashCount / wordCount) * 1000).toFixed(2)) : 0;
                    if (emPat && emPat.severity !== 'off') {
                        var emMode = slopConfig.emDashMode || 'density';
                        if (emMode === 'strict' && (!hardOnly || emPat.severity === 'hard')) {
                            for (var ei = 0; ei < emMatches.length; ei++) {
                                var em = emMatches[ei];
                                var emHardHit = makeHit('hard', 'em_dash', emPat.title, em.match, em.start, em.end, emPat.note, false);
                                hardHits.push(emHardHit);
                                patternHits.push(emHardHit);
                            }
                        } else if (emMode === 'density' && !hardOnly) {
                            var maxPer1k = Number.isFinite(Number(slopConfig.emDashMaxPer1k)) ? Number(slopConfig.emDashMaxPer1k) : 3;
                            if (wordCount >= 100 && emDashCount >= 4 && emDashPer1k > maxPer1k) {
                                var firstEm = emMatches[0];
                                var densEmHit = makeHit(
                                    'flag',
                                    'em_dash',
                                    emPat.title + ' (' + emDashPer1k + '/1k words > ' + maxPer1k + ')',
                                    emDashCount + ' em dashes',
                                    firstEm.start,
                                    firstEm.end,
                                    'Exceeded em-dash density cap (' + emDashPer1k + ' per 1k words).',
                                    false
                                );
                                densEmHit.isClustered = true;
                                patternHits.push(densEmHit);
                            }
                        }
                    }

                    // 3b. Not X, but Y (tightened single-sentence + 2-sentence antithesis)
                    var nxbPat = patMap.not_x_but_y;
                    if (nxbPat && nxbPat.severity !== 'off' && (!hardOnly || nxbPat.severity === 'hard')) {
                        var nxbRx1 = /\b(?:it\s+wasn['’]t|this\s+wasn['’]t|that\s+wasn['’]t|wasn['’]t\s+just|isn['’]t\s+just|weren['’]t\s+just|not\s+just|not\s+merely|not\s+out\s+of)\b[^.!?;]{1,65}?(?:,|—|--)\s*(?:but|it\s+was|it['’]s|it\s+is|they\s+were)\b/gi;
                        var nxbRx2 = /\b(?:it|this|that)\s+(?:wasn['’]t|isn['’]t)\s+[^.!?\n]{2,45}\.\s+(?:it|this|that)\s+(?:was|is)\s+[^.!?\n]{2,45}[.!]/gi;
                        var nxbRanges = [];
                        [nxbRx1, nxbRx2].forEach(function (rx) {
                            var nm;
                            while ((nm = rx.exec(rawText)) !== null) {
                                if (grandfather.has(nm[0])) continue;
                                if (nxbRanges.some(function (r) { return Math.abs(r - nm.index) < 10; })) continue;
                                nxbRanges.push(nm.index);
                                var inEnd = nm.index >= trailingSpan.start && nm.index < trailingSpan.end;
                                var nh = makeHit(inEnd ? 'high_closer' : nxbPat.severity, 'not_x_but_y', nxbPat.title, nm[0], nm.index, nm.index + nm[0].length, '', inEnd);
                                if (inEnd) closerHits.push(nh);
                                if (nxbPat.severity === 'hard') hardHits.push(nh);
                                else patternHits.push(nh);
                            }
                        });
                    }

                    // 3c. Triad rhythm
                    var triPat = patMap.triad;
                    if (triPat && triPat.severity !== 'off' && (!hardOnly || triPat.severity === 'hard')) {
                        var triRx = /\b(\w+\s+\w+)\s+[^,.]{1,30},\s+\1\s+[^,.]{1,30},\s+(?:and\s+)?\1\b/gi;
                        var tm;
                        var triOffsets = [];
                        while ((tm = triRx.exec(rawText)) !== null) {
                            if (grandfather.has(tm[0])) continue;
                            triOffsets.push(tm.index);
                            var triEnd = tm.index >= trailingSpan.start && tm.index < trailingSpan.end;
                            var th = makeHit(triEnd ? 'high_closer' : triPat.severity, 'triad', triPat.title, tm[0], tm.index, tm.index + tm[0].length, '', triEnd);
                            if (triEnd) closerHits.push(th);
                            if (triPat.severity === 'hard') hardHits.push(th);
                            else patternHits.push(th);
                        }
                        // Also check 3 consecutive sentences with identical 2-word opener ("It was ... It was ... It was ...")
                        var sRx = /[^.!?\n]+[.!?]+/g;
                        var sList = [];
                        var sm;
                        while ((sm = sRx.exec(rawText)) !== null) {
                            var st = sm[0].trim();
                            var two = st.match(/^([A-Za-z]+['’]?[A-Za-z]*\s+[A-Za-z]+['’]?[A-Za-z]*)\b/);
                            if (two) sList.push({ stem: two[1].toLowerCase(), start: sm.index, end: sm.index + sm[0].length, text: st });
                            else sList.push(null);
                        }
                        for (var si = 0; si <= sList.length - 3; si++) {
                            var a = sList[si], b = sList[si + 1], c = sList[si + 2];
                            if (a && b && c && a.stem === b.stem && b.stem === c.stem) {
                                if (triOffsets.some(function (o) { return o >= a.start && o <= c.end; })) continue;
                                var triEnd2 = c.start >= trailingSpan.start && c.start < trailingSpan.end;
                                var th2 = makeHit(triEnd2 ? 'high_closer' : triPat.severity, 'triad', triPat.title, a.stem + ' ... (×3 sentences)', a.start, c.end, '', triEnd2);
                                if (triEnd2) closerHits.push(th2);
                                if (triPat.severity === 'hard') hardHits.push(th2);
                                else patternHits.push(th2);
                                si += 2;
                            }
                        }
                    }

                    // 3d. Invented place suffix
                    var psPat = patMap.place_suffix;
                    if (psPat && psPat.severity !== 'off' && (!hardOnly || psPat.severity === 'hard')) {
                        var psRx = /\b[A-Z][a-z]+(?:brook|haven|wood|vale|crest|fall|fell|shire|moor|hold|spire)\b/g;
                        var pm;
                        while ((pm = psRx.exec(rawText)) !== null) {
                            var wLow = pm[0].toLowerCase();
                            if (PLACE_SUFFIX_EXCLUSIONS.has(wLow)) continue;
                            if (grandfather.has(pm[0])) continue;
                            if (isAtSentenceStart(rawText, pm.index)) continue;
                            var psh = makeHit(psPat.severity, 'place_suffix', psPat.title, pm[0], pm.index, pm.index + pm[0].length, '', false);
                            if (psPat.severity === 'hard') hardHits.push(psh);
                            else patternHits.push(psh);
                        }
                    }

                    // 3e. Synth- or Quantum- names
                    var sqPat = patMap.synth_quantum;
                    if (sqPat && sqPat.severity !== 'off' && (!hardOnly || sqPat.severity === 'hard')) {
                        var sqRx = /\b(?:Synth|Quantum)[A-Za-z]*\b/g;
                        var sqm;
                        while ((sqm = sqRx.exec(rawText)) !== null) {
                            if (grandfather.has(sqm[0])) continue;
                            var sqh = makeHit(sqPat.severity, 'synth_quantum', sqPat.title, sqm[0], sqm.index, sqm.index + sqm[0].length, '', false);
                            if (sqPat.severity === 'hard') hardHits.push(sqh);
                            else patternHits.push(sqh);
                        }
                    }

                    // 3f. Smart quotes (off by default)
                    var smartPat = patMap.smart_quotes;
                    if (smartPat && smartPat.severity !== 'off' && (!hardOnly || smartPat.severity === 'hard')) {
                        var smqRx = /[“”‘’]/g;
                        var smqm;
                        while ((smqm = smqRx.exec(rawText)) !== null) {
                            var smqh = makeHit(smartPat.severity, 'smart_quotes', smartPat.title, smqm[0], smqm.index, smqm.index + 1, smartPat.note, false);
                            if (smartPat.severity === 'hard') hardHits.push(smqh);
                            else patternHits.push(smqh);
                        }
                    }

                    // 4. Density checks
                    if (!hardOnly) {
                        var densMap = {};
                        effData.density.forEach(function (d) { densMap[d.id] = d; });
                        var wordTokens = [];
                        var wtRx = /[A-Za-z']+/g;
                        var wtm;
                        while ((wtm = wtRx.exec(rawText)) !== null) {
                            wordTokens.push({ lower: wtm[0].toLowerCase(), start: wtm.index, end: wtm.index + wtm[0].length });
                        }

                        var echoRule = densMap.echo_chamber;
                        if (echoRule && echoRule.severity !== 'off' && wordTokens.length > 0) {
                            var echoWin = echoRule.window || 200;
                            var echoNeed = echoRule.count || 3;
                            var positions = {};
                            for (var wi = 0; wi < wordTokens.length; wi++) {
                                var wt = wordTokens[wi];
                                if (STOP_WORDS_SLOP.has(wt.lower) || wt.lower.length < 4) continue;
                                var rawChar = rawText[wt.start];
                                if (rawChar && rawChar === rawChar.toUpperCase() && rawChar !== rawChar.toLowerCase() && !isAtSentenceStart(rawText, wt.start)) continue;
                                if (grandfather.has(wt.lower)) continue;
                                if (!positions[wt.lower]) positions[wt.lower] = [];
                                positions[wt.lower].push(wi);
                            }
                            var echoSeen = new Set();
                            Object.keys(positions).forEach(function (wKey) {
                                var idxArr = positions[wKey];
                                for (var j = 0; j <= idxArr.length - echoNeed; j++) {
                                    if (idxArr[j + echoNeed - 1] - idxArr[j] < echoWin) {
                                        var bucket = wKey + '::' + Math.floor(idxArr[j] / echoWin);
                                        if (!echoSeen.has(bucket)) {
                                            echoSeen.add(bucket);
                                            var eStart = wordTokens[idxArr[j]].start;
                                            var eEnd = wordTokens[idxArr[j + echoNeed - 1]].end;
                                            densityHits.push(makeHit(echoRule.severity, 'echo_chamber', echoRule.title, wKey, eStart, eEnd, '', false));
                                        }
                                        break;
                                    }
                                }
                            });
                        }

                        var puncRule = densMap.punctuation_collapse;
                        if (puncRule && puncRule.severity !== 'off' && wordTokens.length > 0) {
                            var pWin = puncRule.window || 500;
                            var step = Math.max(50, Math.floor(pWin / 2));
                            for (var pi = 0; pi <= wordTokens.length - pWin; pi += step) {
                                var chunk = wordTokens.slice(pi, pi + pWin);
                                if (chunk.length < pWin) break;
                                var span = rawText.slice(chunk[0].start, chunk[chunk.length - 1].end);
                                if (!/[;:?]|\.\.\.|…/.test(span)) {
                                    densityHits.push(makeHit(puncRule.severity, 'punctuation_collapse', puncRule.title, pWin + ' words', chunk[0].start, chunk[chunk.length - 1].end, '', false));
                                    break;
                                }
                            }
                        }

                        var qRule = densMap.question_free_dialogue;
                        if (qRule && qRule.severity !== 'off' && rawText.trim().length > 80) {
                            var dialogueChunks = isAudioDrama
                                ? (rawText.match(/^[A-Z][A-Za-z0-9\s.'-]{1,30}:\s+.+$/gm) || []).filter(function (l) { return !/^Narrator:/i.test(l); })
                                : (rawText.match(/["“][^"”\n]{2,}["”]/g) || []);
                            if (dialogueChunks.length >= 3 && rawText.indexOf('?') === -1) {
                                densityHits.push(makeHit(qRule.severity, 'question_free_dialogue', qRule.title, dialogueChunks.length + ' dialogue turns, 0 "?"', 0, Math.min(rawText.length, 60), '', false));
                            }
                        }
                    }

                    // 5. Clustering & Gate logic
                    var phraseCounts = {};
                    var categoryCounts = {};
                    var paraFlagCounts = {};
                    for (var hi = 0; hi < flagHits.length; hi++) {
                        var fh = flagHits[hi];
                        var beforeText = rawText.slice(0, fh.start || 0);
                        var paraMatches = beforeText.match(/\n\s*\n/g);
                        var pIdx = paraMatches ? paraMatches.length : 0;
                        fh._paraIdx = pIdx;
                        var pKey = fh.categoryId + '::' + fh.match.toLowerCase();
                        phraseCounts[pKey] = (phraseCounts[pKey] || 0) + 1;
                        categoryCounts[fh.categoryId] = (categoryCounts[fh.categoryId] || 0) + 1;
                        paraFlagCounts[pIdx] = (paraFlagCounts[pIdx] || 0) + 1;
                    }
                    var clusteredFlagHits = [];
                    for (var hj = 0; hj < flagHits.length; hj++) {
                        var fhj = flagHits[hj];
                        var pKey2 = fhj.categoryId + '::' + fhj.match.toLowerCase();
                        if (phraseCounts[pKey2] >= 2 || categoryCounts[fhj.categoryId] >= 3 || paraFlagCounts[fhj._paraIdx] >= 2) {
                            fhj.isClustered = true;
                            clusteredFlagHits.push(fhj);
                        }
                        delete fhj._paraIdx;
                    }

                    var notXCount = patternHits.filter(function (p) { return p.categoryId === 'not_x_but_y'; }).length;
                    var triadCount = patternHits.filter(function (p) { return p.categoryId === 'triad'; }).length;
                    var emClusterCount = patternHits.filter(function (p) { return p.categoryId === 'em_dash' && p.isClustered; }).length;

                    var reasons = [];
                    if (hardHits.length > 0) reasons.push(hardHits.length + ' hard defect(s)');
                    if (closerHits.length > 0) reasons.push(closerHits.length + ' scene-closing tell(s) in final 2 sentences');
                    if (clusteredFlagHits.length > 0) reasons.push(clusteredFlagHits.length + ' clustered flag hit(s)');
                    if (notXCount >= 3) reasons.push(notXCount + ' "Not X, but Y" constructions');
                    if (triadCount >= 2) reasons.push(triadCount + ' triad rhythms');

                    var shouldTriggerSurgicalGate = (
                        hardHits.length >= 1 ||
                        closerHits.length >= 1 ||
                        clusteredFlagHits.length >= 1 ||
                        notXCount >= 3 ||
                        triadCount >= 2
                    );
                    var hasActionableItems = shouldTriggerSurgicalGate || patternHits.length > 0 || densityHits.length > 0;

                    var allHits = hardHits.concat(closerHits, flagHits, patternHits.filter(function (p) { return p.severity !== 'hard' && !p.isTrailingCloser; }), densityHits);
                    allHits.sort(function (a, b) {
                        var rank = { hard: 0, high_closer: 1, flag: 2 };
                        var ra = rank[a.severity] !== undefined ? rank[a.severity] : 3;
                        var rb = rank[b.severity] !== undefined ? rank[b.severity] : 3;
                        if (ra !== rb) return ra - rb;
                        return a.start - b.start;
                    });

                    return {
                        hardHits: hardHits,
                        closerHits: closerHits,
                        flagHits: flagHits,
                        clusteredFlagHits: clusteredFlagHits,
                        patternHits: patternHits,
                        densityHits: densityHits,
                        allHits: allHits,
                        phraseCounts: phraseCounts,
                        categoryCounts: categoryCounts,
                        summary: {
                            wordCount: wordCount,
                            hardCount: hardHits.length,
                            closerCount: closerHits.length,
                            flagCount: flagHits.length,
                            clusteredFlagCount: clusteredFlagHits.length,
                            patternCount: patternHits.length,
                            densityCount: densityHits.length,
                            emDashCount: emDashCount,
                            emDashPer1k: emDashPer1k,
                            emClusterCount: emClusterCount,
                            shouldTriggerSurgicalGate: shouldTriggerSurgicalGate,
                            hasActionableItems: hasActionableItems,
                            reasons: reasons
                        }
                    };
                };

                window.formatSlopAuditForPrompt = function (auditReport, options) {
                    if (!auditReport) return '';
                    var opts = options || {};
                    var maxItems = opts.maxItems || 15;
                    var includeSentences = opts.includeSentences !== false;
                    var lines = [];
                    var seen = new Set();

                    function pushLine(tag, hit) {
                        if (lines.length >= maxItems) return;
                        var key = tag + '::' + hit.categoryId + '::' + hit.match.toLowerCase() + '::' + hit.line;
                        if (seen.has(key)) return;
                        seen.add(key);
                        var sentPart = (includeSentences && hit.sentence) ? ' | Sentence: "' + hit.sentence.slice(0, 220) + '"' : '';
                        var notePart = hit.note ? ' (' + hit.note + ')' : '';
                        lines.push('- [' + tag + ' | ' + hit.categoryTitle + '] "' + hit.match + '"' + notePart + sentPart);
                    }

                    (auditReport.hardHits || []).forEach(function (h) { pushLine('HARD DEFECT - MUST REPLACE', h); });
                    (auditReport.closerHits || []).forEach(function (h) { pushLine('SCENE CLOSER - FINAL 2 SENTENCES', h); });
                    (auditReport.clusteredFlagHits || []).forEach(function (h) { pushLine('FLAG CLUSTER - REWORK REPETITION', h); });
                    (auditReport.patternHits || []).forEach(function (h) {
                        if (h.severity !== 'hard' && !h.isTrailingCloser) pushLine('RHETORICAL/STYLE PATTERN', h);
                    });
                    (auditReport.densityHits || []).forEach(function (h) { pushLine('DENSITY WARNING', h); });
                    return lines.join('\n');
                };

                window.extractCandidatePlaceNames = function (text, excludeCast) {
                    if (!text || typeof text !== 'string') return [];
                    var castTokens = new Set();
                    (excludeCast || []).forEach(function (c) {
                        var nm = typeof c === 'string' ? c : (c && c.name);
                        if (!nm) return;
                        nm.toLowerCase().split(/\s+/).forEach(function (t) { if (t) castTokens.add(t); });
                    });
                    var candidates = [];
                    var seen = new Set();
                    // Multi-word capitalized phrases and mid-sentence single proper nouns
                    var rx = /\b(?:The\s+)?[A-Z][a-z]+(?:\s+(?:of\s+)?[A-Z][a-z]+){0,3}\b/g;
                    var m;
                    while ((m = rx.exec(text)) !== null) {
                        var phrase = m[0].trim();
                        if (phrase.length < 3) continue;
                        var low = phrase.toLowerCase();
                        if (castTokens.has(low)) continue;
                        if (phrase.indexOf(' ') === -1 && isAtSentenceStart(text, m.index)) continue;
                        if (!seen.has(low)) {
                            seen.add(low);
                            candidates.push(phrase);
                        }
                    }
                    return candidates;
                };

                window.auditEntityNamesAndPlaces = function (params) {
                    var p = params || {};
                    var characters = Array.isArray(p.characters) ? p.characters : [];
                    var places = Array.isArray(p.places) ? p.places : [];
                    var existingCast = Array.isArray(p.existingCast) ? p.existingCast : [];
                    var slopConfig = p.slopConfig || DEFAULT_SLOP_CONFIG;
                    var effData = window.buildEffectiveSlopData(slopConfig);
                    var grandfather = window.buildStoryGrandfatherSet(p.story, { includeCast: false });

                    var catById = {};
                    effData.categories.forEach(function (c) { catById[c.id] = c; });
                    var patById = {};
                    effData.patterns.forEach(function (pt) { patById[pt.id] = pt; });

                    function checkNameAgainstCat(nameStr, cat, allowDeriv) {
                        if (!cat || cat.severity === 'off') return null;
                        for (var i = 0; i < (cat.items || []).length; i++) {
                            var item = cat.items[i];
                            if (grandfather.has(item)) continue;
                            var found = findBoundaryMatches(nameStr, item, cat.match, allowDeriv);
                            if (found.length > 0) {
                                if (NO_DERIVATIVE_NAME_CATS.has(cat.id) && found[0].match.length > item.length) continue;
                                return { item: item, matched: found[0].match, categoryId: cat.id, categoryTitle: cat.title, severity: cat.severity };
                            }
                        }
                        return null;
                    }

                    // Count overdrawn budgets already consumed by existingCast
                    var overdrawnFirstUsed = 0;
                    var overdrawnSurnameUsed = 0;
                    var overdrawnPlaceUsed = 0;
                    var existingFirstList = [];
                    var existingSurnameList = [];

                    existingCast.forEach(function (ec) {
                        var ecName = String(typeof ec === 'string' ? ec : (ec && ec.name) || '').trim();
                        if (!ecName || grandfather.has(ecName)) return;
                        if (checkNameAgainstCat(ecName, catById.names_overdrawn, false)) {
                            overdrawnFirstUsed++;
                            existingFirstList.push(ecName);
                        }
                        if (checkNameAgainstCat(ecName, catById.surnames_overdrawn, false)) {
                            overdrawnSurnameUsed++;
                            existingSurnameList.push(ecName);
                        }
                    });

                    var hardCharCats = ['names_stock_full', 'names_feminine', 'names_masculine', 'names_romance_hero', 'names_unisex', 'names_word', 'surnames'];
                    var violations = [];
                    var hardViolations = [];
                    var overdrawnViolations = [];

                    for (var ci = 0; ci < characters.length; ci++) {
                        var ch = characters[ci];
                        var cName = String(typeof ch === 'string' ? ch : (ch && ch.name) || '').trim();
                        if (!cName || grandfather.has(cName)) continue;
                        var isProtagonist = Boolean(ch && (ch.id === 'C1' || ch.corner_role === 'MAIN_CHARACTER' || /protagonist/i.test(ch.role || '')));

                        var hitHard = null;
                        for (var hci = 0; hci < hardCharCats.length; hci++) {
                            var cId = hardCharCats[hci];
                            var cat = catById[cId];
                            if (!cat || cat.severity !== 'hard') continue;
                            var res = checkNameAgainstCat(cName, cat, PREFIX_DERIVATIVE_NAME_CATS.has(cId));
                            if (res) { hitHard = res; break; }
                        }
                        if (!hitHard && patById.synth_quantum && patById.synth_quantum.severity === 'hard' && /\b(?:Synth|Quantum)[A-Za-z]*\b/.test(cName)) {
                            hitHard = { item: cName, matched: cName, categoryId: 'synth_quantum', categoryTitle: 'Synth- or Quantum- names', severity: 'hard' };
                        }
                        if (hitHard) {
                            var vHard = { entityType: 'character', name: cName, id: ch && ch.id, role: ch && ch.role, reason: hitHard.categoryTitle + ' ("' + hitHard.matched + '")', severity: 'hard', categoryId: hitHard.categoryId };
                            violations.push(vHard);
                            hardViolations.push(vHard);
                            continue;
                        }

                        // Overdrawn given name budget (max 1 supporting/minor character per story; never protagonist)
                        var ovFirst = checkNameAgainstCat(cName, catById.names_overdrawn, false);
                        if (ovFirst && catById.names_overdrawn.severity !== 'off') {
                            if (isProtagonist || overdrawnFirstUsed >= 1 || catById.names_overdrawn.severity === 'hard') {
                                var vOvF = {
                                    entityType: 'character',
                                    name: cName,
                                    id: ch && ch.id,
                                    role: ch && ch.role,
                                    reason: isProtagonist
                                        ? 'Overdrawn given name "' + ovFirst.matched + '" on protagonist (allowed only for at most 1 minor character)'
                                        : 'Overdrawn given name "' + ovFirst.matched + '" exceeds 1-per-story budget (already used by ' + (existingFirstList[0] || 'another character') + ')',
                                    severity: 'overdrawn',
                                    categoryId: 'names_overdrawn'
                                };
                                violations.push(vOvF);
                                overdrawnViolations.push(vOvF);
                                continue;
                            } else {
                                overdrawnFirstUsed++;
                                existingFirstList.push(cName);
                            }
                        }

                        // Overdrawn surname budget (max 1 per story)
                        var ovSur = checkNameAgainstCat(cName, catById.surnames_overdrawn, false);
                        if (ovSur && catById.surnames_overdrawn.severity !== 'off') {
                            if (overdrawnSurnameUsed >= 1 || catById.surnames_overdrawn.severity === 'hard') {
                                var vOvS = {
                                    entityType: 'character',
                                    name: cName,
                                    id: ch && ch.id,
                                    role: ch && ch.role,
                                    reason: 'Overdrawn surname "' + ovSur.matched + '" exceeds 1-per-story budget',
                                    severity: 'overdrawn',
                                    categoryId: 'surnames_overdrawn'
                                };
                                violations.push(vOvS);
                                overdrawnViolations.push(vOvS);
                            } else {
                                overdrawnSurnameUsed++;
                                existingSurnameList.push(cName);
                            }
                        }
                    }

                    for (var pi = 0; pi < places.length; pi++) {
                        var pl = places[pi];
                        var pName = String(typeof pl === 'string' ? pl : (pl && pl.name) || '').trim();
                        if (!pName || grandfather.has(pName)) continue;

                        var plHard = (catById.places && catById.places.severity === 'hard') ? checkNameAgainstCat(pName, catById.places, true) : null;
                        if (!plHard && patById.synth_quantum && patById.synth_quantum.severity === 'hard' && /\b(?:Synth|Quantum)[A-Za-z]*\b/.test(pName)) {
                            plHard = { item: pName, matched: pName, categoryId: 'synth_quantum', categoryTitle: 'Synth- or Quantum- names', severity: 'hard' };
                        }
                        if (!plHard && patById.place_suffix && patById.place_suffix.severity !== 'off') {
                            var psMatch = pName.match(/\b[A-Z][a-z]+(?:brook|haven|wood|vale|crest|fall|fell|shire|moor|hold|spire)\b/);
                            if (psMatch && !PLACE_SUFFIX_EXCLUSIONS.has(psMatch[0].toLowerCase())) {
                                plHard = { item: psMatch[0], matched: psMatch[0], categoryId: 'place_suffix', categoryTitle: 'Stock place suffix', severity: patById.place_suffix.severity };
                            }
                        }
                        if (plHard) {
                            var vp = { entityType: 'place', name: pName, reason: plHard.categoryTitle + ' ("' + plHard.matched + '")', severity: plHard.severity === 'hard' ? 'hard' : 'overdrawn', categoryId: plHard.categoryId };
                            violations.push(vp);
                            if (vp.severity === 'hard') hardViolations.push(vp);
                            else overdrawnViolations.push(vp);
                            continue;
                        }

                        var plOv = checkNameAgainstCat(pName, catById.places_overdrawn, false);
                        if (plOv && catById.places_overdrawn.severity !== 'off') {
                            if (overdrawnPlaceUsed >= 1 || catById.places_overdrawn.severity === 'hard') {
                                var vpo = { entityType: 'place', name: pName, reason: 'Overdrawn place/group name "' + plOv.matched + '" exceeds 1-per-story budget', severity: 'overdrawn', categoryId: 'places_overdrawn' };
                                violations.push(vpo);
                                overdrawnViolations.push(vpo);
                            } else {
                                overdrawnPlaceUsed++;
                            }
                        }
                    }

                    return {
                        valid: violations.length === 0,
                        violations: violations,
                        hardViolations: hardViolations,
                        overdrawnViolations: overdrawnViolations,
                        overdrawnCounts: {
                            firstNames: overdrawnFirstUsed,
                            surnames: overdrawnSurnameUsed,
                            places: overdrawnPlaceUsed
                        }
                    };
                };

                window.applyCascadingNameReplacements = function (text, renameMap) {
                    if (!text || typeof text !== 'string' || !renameMap) return text;
                    var entries = Object.keys(renameMap)
                        .filter(function (k) { return k && renameMap[k] && k !== renameMap[k]; })
                        .sort(function (a, b) { return b.length - a.length; });
                    var out = text;
                    for (var i = 0; i < entries.length; i++) {
                        var oldName = entries[i];
                        var newName = renameMap[oldName];
                        var rx = new RegExp(escapeRx(oldName), 'g');
                        out = out.replace(rx, function (matched, offset, fullStr) {
                            var prev = offset > 0 ? fullStr[offset - 1] : '';
                            var next = (offset + matched.length) < fullStr.length ? fullStr[offset + matched.length] : '';
                            if (isAsciiAlnum(oldName[0]) && isAsciiLetter(prev)) return matched;
                            if (isAsciiAlnum(oldName[oldName.length - 1]) && isAsciiLetter(next)) return matched;
                            return newName;
                        });
                    }
                    return out;
                };
            })();
