/**
 * @module services/images/prompts
 * Sanitizes image-prompt agent XML envelopes into raw prompt strings.
 */

import { extractTag, stripXmlTags } from '@/utils';

/**
 * Strips `<response><image_prompt>...</image_prompt></response>` wrappers so only the
 * raw visual generation prompt is sent to image models.
 */
export function cleanImagePrompt(raw: unknown): string {
    const text = String(raw || '');
    const tagged = extractTag(text, 'image_prompt');
    return (tagged || stripXmlTags(text)).trim();
}
