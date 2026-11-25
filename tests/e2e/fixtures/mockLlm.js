/**
 * Deterministic fake LLM for the golden suite's mocked-pipeline scenario.
 *
 * Evaluated inside the browser page; defines window.__goldenMockLlm(prompt, systemPrompt, isJson, logName).
 * Every answer is a pure function of its inputs, so the same build always produces the same run and two
 * builds that send the same prompts produce the same story.
 *
 * Strategy:
 *  - reviewers and auditors always pass;
 *  - agents whose prompt carries an <output_format_description> get that template echoed back,
 *    which is structurally valid for every structure-tier parser;
 *  - the scene planner, prose writer, polish pass, and JSON agents get small purpose-built generators.
 */
(function installGoldenMockLlm() {
    const lastFormatTemplate = (text) => {
        const matches = [...String(text || '').matchAll(/<output_format_description>([\s\S]*?)<\/output_format_description>/g)];
        return matches.length ? matches[matches.length - 1][1].trim() : '';
    };

    const seededRandom = (text) => {
        let h = 2166136261;
        for (let i = 0; i < text.length; i += 7) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return () => {
            h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
            return h / 4294967296;
        };
    };

    const planScenes = (prompt, systemPrompt) => {
        const template = (systemPrompt.match(/<scene>[\s\S]*?<\/scene>/) || [''])[0];
        const count = Number((prompt.match(/Plan approximately (\d+)/) || [])[1] || 3);
        const seq = Number((prompt.match(/Blueprints for Sequence (\d+)/) || [])[1] || 1);
        const cast = [...prompt.matchAll(/^- ([^(\n]+?) \(/gm)].map((m) => m[1].trim());
        const pov = cast[0] || 'Protagonist';
        const scenes = [];
        for (let i = 1; i <= count; i++) {
            scenes.push(template
                .replace(/<scene_id>[\s\S]*?<\/scene_id>/, `<scene_id>${seq}.${i}</scene_id>`)
                .replace(/<title>[\s\S]*?<\/title>/, `<title>Mock Scene ${seq}.${i}</title>`)
                .replace(/<pov_character>[\s\S]*?<\/pov_character>/, `<pov_character>${pov}</pov_character>`)
                .replace(/<characters_present>[\s\S]*?<\/characters_present>/, `<characters_present>${cast.slice(0, 2).join(', ') || pov}</characters_present>`)
                .replace(/<dominant_narrative_mode>[\s\S]*?<\/dominant_narrative_mode>/, `<dominant_narrative_mode>${i % 2 ? 'RELATIONAL' : 'REFLECTION'}</dominant_narrative_mode>`)
                .replace(/<epistemic_friction_level>[\s\S]*?<\/epistemic_friction_level>/, '<epistemic_friction_level>LOW</epistemic_friction_level>')
                .replace(/<target_epistemic_deltas>[\s\S]*?<\/target_epistemic_deltas>/, '<target_epistemic_deltas></target_epistemic_deltas>'));
        }
        return scenes.join('\n');
    };

    const writeProse = (prompt) => {
        const target = Number(((prompt.match(/approximately ([\d,]+) words/) || [])[1] || '600').replace(/,/g, ''));
        const rnd = seededRandom(prompt);
        const pick = (list) => list[Math.floor(rnd() * list.length)];
        const who = ((prompt.match(/character present: ([^)\n]+)\)/) || prompt.match(/<pov_character>([^<]+)</) || [])[1] || 'Maren')
            .trim().split(',')[0];
        const subjects = [who, 'She', 'The keeper', who, 'The harbor', 'A gull', 'The lamp', 'Her ledger', 'The tide'];
        const verbs = ['crossed', 'studied', 'lifted', 'counted', 'turned toward', 'set down', 'remembered', 'walked past', 'opened', 'folded', 'carried', 'watched'];
        const objects = ['the wet planks of the pier', 'a column of smudged figures', 'the brass weights on the shelf', 'the lantern by the door', 'the long grey water', 'a ring of dried salt', 'the ledger with the cracked spine', 'the rope coiled at the bollard', 'the shuttered customs house', 'a page gone soft with damp'];
        const tails = ['while the wind worked at the shutters', 'and the smell of tar came up from below', 'as the bell on the mole rang twice', 'before the light went out of the west', 'and nobody on the quay looked up', 'though the ink had not yet dried', 'until the kettle began to tick on the stove', 'with the tide already turning under the piles'];
        const spoken = [`"Not this page," ${who} said quietly.`, `"Count it again," ${who} muttered.`, `"Three weeks gone," ${who} whispered to the empty room.`, `"Somebody scraped it clean," ${who} said.`];
        const paragraphs = [];
        let words = 0;
        while (words < target) {
            const sentences = [];
            const n = 4 + Math.floor(rnd() * 3);
            for (let i = 0; i < n; i++) {
                const sentence = rnd() < 0.14
                    ? pick(spoken)
                    : `${pick(subjects)} ${pick(verbs)} ${pick(objects)} ${pick(tails)}, number ${words + i} in the tally.`;
                sentences.push(sentence);
                words += sentence.split(/\s+/).length;
            }
            paragraphs.push(sentences.join(' '));
        }
        return `<prose_text>\n${paragraphs.join('\n\n')}\n</prose_text>`;
    };

    window.__goldenMockLlm = async (prompt, systemPrompt, isJson, logName) => {
        const p = String(prompt || '');
        const sys = String(systemPrompt || '');
        const name = String(logName || '');

        if (/review/i.test(name)) {
            return '<response><status>PASS</status><critique_analysis>Deterministic mock review: accepted.</critique_analysis></response>';
        }
        if (/^Style & Sensory Polish/.test(name)) {
            const draft = (p.match(/<draft_prose>([\s\S]*?)<\/draft_prose>/) || [])[1] || '';
            return `<polished_prose>${draft.trim()}</polished_prose>`;
        }
        if (/^Continuity Auditor/.test(name)) return '<audit_status>PASS</audit_status>';
        if (/^Scene Boundary Continuity Auditor/.test(name)) return '<continuity_status>PASS</continuity_status>';
        if (/^Surgical Editor/.test(name)) return '<edits></edits>';
        if (/^Archivist/.test(name)) return '{}';
        if (/^Scene Planner/.test(name)) return planScenes(p, sys);
        if (/^Writing Agent/.test(name) || /<prose_text>/.test(lastFormatTemplate(p))) return writeProse(p);
        if (isJson) return '{}';
        return lastFormatTemplate(p) || lastFormatTemplate(sys);
    };
})();
