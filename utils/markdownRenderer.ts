import { marked } from 'marked';

// The KaTeX extension was removed due to a suspected version incompatibility with 'marked' that was causing app load failures.
// Re-enabling this feature would require finding a compatible extension or downgrading the 'marked' library.

/**
 * A centralized function to render Markdown text into HTML.
 * @param {string} markdownText - The Markdown string to render.
 * @returns {string} The rendered HTML string.
 */
export const renderMarkdown = (markdownText: string): string => {
    if (!markdownText) return '';
    try {
        // This now uses the vanilla 'marked' library without any extensions.
        return marked(markdownText);
    } catch (error) {
        console.error("Markdown rendering failed:", error);
        return `<p class="text-danger">Error rendering content.</p>`;
    }
};
