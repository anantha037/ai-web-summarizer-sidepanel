// Content Script: Extracts and returns clean text content from document body, with custom YouTube transcript extraction.
(async () => {
  if (window.location.hostname.includes("youtube.com") && window.location.search.includes("v=")) {
    try {
      const transcript = await getYouTubeTranscript();
      if (transcript) {
        return transcript;
      }
    } catch (e) {
      console.warn("Failed to get YouTube transcript, falling back to body text:", e);
    }
  }

  // Fallback to standard page body text
  const rawText = document.body.innerText || "";
  const cleanedText = rawText
    .replace(/\s+/g, ' ')
    .trim();
  return cleanedText;

  // Helper to extract YouTube subtitles/transcript
  async function getYouTubeTranscript() {
    let playerResponse = null;
    const scripts = document.getElementsByTagName('script');
    
    // Search for ytInitialPlayerResponse script tag
    for (let script of scripts) {
      const text = script.textContent;
      const index = text.indexOf('ytInitialPlayerResponse =');
      if (index !== -1) {
        let jsonStr = text.substring(index + 'ytInitialPlayerResponse ='.length).trim();
        // Use balancing braces to extract JSON object safely
        let braceCount = 0;
        let startPos = jsonStr.indexOf('{');
        if (startPos !== -1) {
          for (let i = startPos; i < jsonStr.length; i++) {
            if (jsonStr[i] === '{') braceCount++;
            else if (jsonStr[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                const candidate = jsonStr.substring(startPos, i + 1);
                try {
                  playerResponse = JSON.parse(candidate);
                  break;
                } catch (e) {
                  // Ignore parse error, try next
                }
              }
            }
          }
        }
      }
      if (playerResponse) break;
    }

    if (!playerResponse) {
      throw new Error("Could not find YouTube player response metadata.");
    }

    const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error("This video does not have any captions or transcript available.");
    }

    // Prefer English track if available, else choose first
    let track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    if (!track || !track.baseUrl) {
      throw new Error("No valid caption track URL found.");
    }

    // Fetch XML captions
    const response = await fetch(track.baseUrl);
    if (!response.ok) {
      throw new Error("Failed to download transcript XML.");
    }

    const xmlText = await response.text();
    
    // Parse captions XML using DOMParser
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const textNodes = xmlDoc.getElementsByTagName("text");
    
    let transcriptLines = [];
    for (let node of textNodes) {
      const rawLine = node.textContent || "";
      const decodedLine = rawLine
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      transcriptLines.push(decodedLine);
    }

    if (transcriptLines.length === 0) {
      throw new Error("Transcript XML was empty.");
    }

    const videoTitle = playerResponse.videoDetails?.title || document.title;
    return `YouTube Video: ${videoTitle}\n\nTranscript:\n${transcriptLines.join(" ")}`;
  }
})();
