import sanitizeHtml from 'sanitize-html';

/**
 * Sanitizes rich email markup before it is persisted or rendered in the admin
 * preview. Email HTML remains deliberately small: formatting, links, and
 * images only. Active content and form/navigation primitives are not allowed.
 */
export function sanitizeEmailTemplateHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3',
      'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'span',
      'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  });
}
