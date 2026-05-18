// Content Script: Extracts and returns clean text content from document body
(() => {
  // Grab standard innerText
  const rawText = document.body.innerText || "";
  // Perform minimal cleaning to strip excessive consecutive blank lines/whitespace
  const cleanedText = rawText
    .replace(/\s+/g, ' ')
    .trim();
  return cleanedText;
})();
