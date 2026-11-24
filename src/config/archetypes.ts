/**
 * @module config/archetypes
 * Genre, style, and concept seed banks plus random archetype generator.
 */

export const ARCH_GENRES: readonly string[] = [
    'Space Opera',
    'Cyberpunk',
    'High Fantasy',
    'Urban Fantasy',
    'Post-Apocalyptic',
    'Dystopian',
    'Gothic Horror',
    'Cosmic Horror',
    'Hard Boiled Noir',
    'Western',
    'Steampunk',
    'Romantic Comedy',
    'Political Thriller',
    'Espionage',
    'Superhero',
    'Slice of Life',
    'Historical Drama',
    'Military Sci-Fi',
    'Whodunit',
    'Survival Thriller',
    'Dark Fantasy',
    'Biopunk',
    'Solarpunk',
    'Mythpunk',
    'Gaslamp Fantasy',
    'Cozy Mystery',
    'Legal Thriller',
    'Psychological Horror',
    'Climate Fiction',
    'Weird West',
    'Sword & Sorcery',
    'Dieselpunk',
    'Magical Realism',
    'Techno-Thriller',
    'Romantic Suspense',
    'Epic Historical',
    'Grimdark',
    'Alien Contact',
    'Maritime Adventure',
    'Heist Caper'
];

export const ARCH_STYLES: readonly string[] = [
    'Moody & Atmospheric',
    'Fast-paced & Kinetic',
    'Witty & Satirical',
    'Dark & Gritty',
    'Optimistic & Whimsical',
    'Intellectual & Philosophical',
    'Minimalist & Stark',
    'Lyrical & Poetic',
    'Suspenseful & Tense',
    'Melancholic & Reflective',
    'Campy & Over-the-top',
    'Brutal & Unflinching',
    'Dreamlike & Surreal',
    'Warm & Intimate',
    'Cold & Clinical',
    'Playful & Irreverent',
    'Grandiose & Epic',
    'Claustrophobic & Paranoid',
    'Bittersweet & Nostalgic',
    'Frenetic & Chaotic',
    'Quiet & Contemplative',
    'Acerbic & Ironic',
    'Lush & Sensory',
    'Sparse & Detached'
];

export const ARCH_CONCEPTS: readonly string[] = [
    'a lone wanderer seeks redemption for a past sin',
    'a team of specialists pulls off the ultimate heist',
    "a detective investigates a murder that shouldn't be possible",
    'strangers are trapped together in a confined location',
    'a chosen one rejects their destiny',
    'an artificial intelligence discovers emotions',
    'a magical artifact ruins the life of its owner',
    'two enemies are forced to work together to survive',
    'a civilization faces imminent collapse from an unseen threat',
    'a character wakes up with no memory in a strange world',
    'a forbidden romance alters the course of history',
    'a small lie spirals out of control into a global conspiracy',
    'an explorer discovers a land that defies the laws of physics',
    'a soldier questions the morality of their orders',
    'a family secret threatens to destroy a dynasty',
    "a scientist's experiment goes horribly wrong",
    'an underdog competes in a high-stakes tournament',
    'a ghost tries to solve their own murder',
    'a time traveler tries to fix a mistake but makes it worse',
    'a peaceful community is invaded by a superior force',
    'a retired spy is pulled back in for one final mission',
    'a young heir discovers their inheritance comes with a deadly curse',
    'two civilizations on the brink of war share a single translator',
    'a journalist uncovers a story that powerful people will kill to suppress',
    'an orphan learns they are the last of an ancient bloodline',
    'a prophet whose every prediction has come true now foresees their own death',
    'a monster hunter begins to question whether their prey deserves to die',
    'a revolution succeeds, but the victors become what they overthrew',
    'an immortal grows weary of watching everyone they love die',
    'a cartographer maps a territory that keeps rearranging itself',
    'a musician discovers their compositions are literally changing reality',
    "a dying empire's last general must decide whether to fight or surrender",
    'a con artist falls for their mark and must choose loyalty over profit',
    "a colony ship's passengers wake from stasis to find they are not alone",
    'a librarian discovers the books in the restricted section are written in the future',
    'siblings on opposite sides of a war must collaborate to save their mother',
    'a chef at a prestigious restaurant realizes the secret ingredient is forbidden',
    'a linguist is the only person who can communicate with a newly arrived alien species',
    'a cursed kingdom can only be saved by its most dishonest citizen',
    'a lone lighthouse keeper begins receiving transmissions from a ship lost a century ago',
    'an innocent person is framed for a crime and must expose the truth before time runs out',
    "the most trusted member of a group has been protecting them all from a truth they couldn't handle",
    'a person obsessively chasing success finally achieves it and finds it meaningless',
    'someone attempts to reinvent themselves entirely and succeeds — only to lose what made them worth knowing',
    'a mediator brought in to resolve a long-running conflict slowly realizes they are its root cause',
    'two strangers discover their lives have been invisibly shaping each other for decades',
    "a beloved leader's legacy begins to collapse as the compromises that built it come to light",
    'the last surviving member of a destroyed group must choose between answers and revenge',
    'an estranged parent and child are forced to depend on each other during a shared crisis',
    'a person given a rare second chance discovers it comes with conditions they cannot accept',
    'someone returns as an adult to the place that shaped them and must reckon with what it made them',
    'a whistleblower exposes a great wrong but cannot contain the damage that ripples outward',
    "the group's most ruthless member turns out to be the only one capable of an act of true compassion",
    'a peacemaker must choose between an imperfect peace that betrays their people or a righteous war',
    'a mentor discovers their most promising student has surpassed them in ways they find threatening',
    'rivals who have defined themselves against each other must face who they are without the competition',
    "someone inherits a stranger's life — their debts, their enemies, their unfinished obligations",
    'a group of survivors must decide whether the secret that saved them is worth keeping',
    'the person everyone assumed was the villain turns out to have been the only one telling the truth',
    'a community fractures when its founding myth is proven false, and people must choose what to believe instead'
];

export interface ArchetypeOption {
    id: number;
    label: string;
    value: string;
}

export function generateRandomArchetypes(count = 20): ArchetypeOption[] {
    const options: ArchetypeOption[] = [];
    for (let i = 0; i < count; i++) {
        const genre = ARCH_GENRES[Math.floor(Math.random() * ARCH_GENRES.length)];
        const style = ARCH_STYLES[Math.floor(Math.random() * ARCH_STYLES.length)];
        const concept = ARCH_CONCEPTS[Math.floor(Math.random() * ARCH_CONCEPTS.length)];

        options.push({
            id: i,
            label: `${genre} / ${style} / ${concept.substring(0, 30)}...`,
            value: `A ${genre} story written in a ${style} style, wherein ${concept}.`
        });
    }
    return options;
}
