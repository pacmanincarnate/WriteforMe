/**
 * @module services/updates/changelog
 * Formats GitHub release notes and commit summaries into sanitized HTML for the update modal.
 */

import { GITHUB_REPO } from '@/config';
import { parseMarkdown } from '@/utils';

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cleans GitHub release markdown so bare PR, compare, and commit URLs become readable links.
 */
export function formatChangelogMarkdown(rawBody: string, repo: string = GITHUB_REPO): string {
    if (!rawBody || typeof rawBody !== 'string') return '';
    const normalized = rawBody.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!normalized) return '';

    const escapedRepo = escapeRegex(repo);
    const linkOrUrlRe = new RegExp(
        `(\\[[^\\]]*\\]\\([^)]+\\))|(https://github\\.com/${escapedRepo}/(pull|compare|commits)/([^\\s)]+))`,
        'g'
    );

    return normalized.replace(
        linkOrUrlRe,
        (
            match,
            existingMarkdownLink: string | undefined,
            fullUrl: string | undefined,
            kind: string | undefined,
            tail: string | undefined
        ) => {
            if (existingMarkdownLink) return existingMarkdownLink;
            if (!fullUrl || !kind || !tail) return match;
            if (kind === 'pull' && /^\d+$/.test(tail)) {
                return `[#${tail}](${fullUrl})`;
            }
            if (kind === 'compare' || kind === 'commits') {
                return `[${tail}](${fullUrl})`;
            }
            return match;
        }
    );
}

/**
 * Renders GitHub release markdown to DOMPurify-sanitized HTML with safe external anchor attributes.
 */
export function renderChangelogHtml(rawBody: string, repo: string = GITHUB_REPO): string {
    const formatted = formatChangelogMarkdown(rawBody, repo);
    if (!formatted) return '';
    const html = parseMarkdown(formatted);
    if (!html) return '';
    return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
        const cleaned = attrs
            .replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
            .replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        return `<a${cleaned} target="_blank" rel="noopener noreferrer">`;
    });
}
