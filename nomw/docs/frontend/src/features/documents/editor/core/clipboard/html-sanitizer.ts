/**
 * Robust HTML sanitizer and converter for clipboard content.
 * Prevents XSS, script injection, iframes, javascript: URLs, and unsafe event handlers.
 */

export function sanitizeHtml(html: string): string {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove dangerous tags
  const forbiddenTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta'];
  for (const tag of forbiddenTags) {
    const elements = doc.querySelectorAll(tag);
    elements.forEach((el) => el.remove());
  }

  // Sanitize all elements
  const allElements = doc.querySelectorAll('*');
  allElements.forEach((el) => {
    // Remove all attributes starting with "on" (event handlers like onclick, onload)
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'action' || name === 'formaction') {
        el.removeAttribute(attr.name);
      }
      // Sanitize href / src
      if (name === 'href' || name === 'src') {
        const val = attr.value.trim().toLowerCase();
        if (val.startsWith('javascript:') || val.startsWith('data:text/html') || val.startsWith('vbscript:')) {
          el.removeAttribute(attr.name);
        }
      }
    }
  });

  return doc.body.innerHTML;
}
