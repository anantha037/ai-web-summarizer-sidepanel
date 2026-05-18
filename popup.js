document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const keyStatus = document.getElementById('keyStatus');
  const summarizeBtn = document.getElementById('summarizeBtn');
  const loadingContainer = document.getElementById('loadingContainer');
  const resultContainer = document.getElementById('resultContainer');
  const summaryText = document.getElementById('summaryText');
  const copyBtn = document.getElementById('copyBtn');

  // Load saved API Key (Safely checking chrome.storage.local)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['gemini_api_key'], (result) => {
      if (result.gemini_api_key) {
        apiKeyInput.value = result.gemini_api_key;
        updateKeyStatus(true);
      } else {
        updateKeyStatus(false);
      }
    });
  } else {
    // Fallback for regular web browser testing
    const localKey = localStorage.getItem('gemini_api_key');
    if (localKey) {
      apiKeyInput.value = localKey;
      updateKeyStatus(true);
    } else {
      updateKeyStatus(false);
    }
  }

  // Save API Key
  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ gemini_api_key: key }, () => {
          updateKeyStatus(true);
          showTemporaryStatus('Saved!', 'success');
        });
      } else {
        localStorage.setItem('gemini_api_key', key);
        updateKeyStatus(true);
        showTemporaryStatus('Saved!', 'success');
      }
    } else {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['gemini_api_key'], () => {
          updateKeyStatus(false);
          showTemporaryStatus('Cleared!', 'warning');
        });
      } else {
        localStorage.removeItem('gemini_api_key');
        updateKeyStatus(false);
        showTemporaryStatus('Cleared!', 'warning');
      }
    }
  });

  // Summarize Action (Communicates with Background Script and calls Gemini API)
  summarizeBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      alert('Please save a valid Gemini API Key first!');
      return;
    }

    // Show loader, hide result
    loadingContainer.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // Communicate with background service worker to extract active tab's text
      chrome.runtime.sendMessage({ action: "extractText" }, (response) => {
        if (chrome.runtime.lastError) {
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = `<span class="text-rose-400">Error: ${chrome.runtime.lastError.message}</span>`;
          return;
        }

        if (response && response.error) {
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = `<span class="text-rose-400">Error: ${response.error}</span>`;
        } else if (response && response.text) {
          // Send active page text to Gemini API
          generateSummary(key, response.text)
            .then((summary) => {
              loadingContainer.classList.add('hidden');
              resultContainer.classList.remove('hidden');
              summaryText.innerHTML = parseMarkdown(summary);
            })
            .catch((err) => {
              loadingContainer.classList.add('hidden');
              resultContainer.classList.remove('hidden');
              summaryText.innerHTML = `<span class="text-rose-400">Gemini API Error: ${err.message}</span>`;
            });
        } else {
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = `<span class="text-rose-400">Error: No content returned from page.</span>`;
        }
      });
    } else {
      // Fallback for regular web browser testing
      const mockText = "Tailwind CSS is an open-source utility-first CSS framework. Unlike other CSS frameworks like Bootstrap, it does not provide pre-created classes for elements like buttons or cards. Instead, it provides low-level utility classes that let you build completely custom designs without leaving your HTML. This utility-first approach is incredibly fast, flexible, and extremely powerful for building modern premium user interfaces.";
      generateSummary(key, mockText)
        .then((summary) => {
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = parseMarkdown(summary);
        })
        .catch((err) => {
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = `<span class="text-rose-400">Gemini API Error: ${err.message}</span>`;
        });
    }
  });

  // Copy to clipboard action
  copyBtn.addEventListener('click', () => {
    // Get text content excluding any HTML formatting
    navigator.clipboard.writeText(summaryText.innerText).then(() => {
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span class="text-emerald-400">Copied!</span>
      `;
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
      }, 1500);
    });
  });

  // Call Gemini API to generate the summary
  async function generateSummary(apiKey, pageText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // Trim text if it exceeds a reasonable token limit (e.g. ~100k characters)
    const maxChars = 100000;
    const truncatedText = pageText.length > maxChars 
      ? pageText.substring(0, maxChars) + "\n...[Content truncated for length]..." 
      : pageText;

    const prompt = `You are an elite, highly concise webpage summarizer. Below is the text extracted from the active webpage. Please analyze and summarize it.

Follow these strict output guidelines:
1. Provide a professional, engaging summary at the top (2-3 sentences).
2. Create a "## Key Takeaways" section with 4-6 bullet points highlighting the most important facts/insights.
3. If applicable, add a "## Notable Details" section with any key statistics, names, dates, or technical facts.
4. Keep the tone objective and informative. Avoid phrases like "based on the text" or "this article says". Go straight to the information.

Webpage Content to Summarize:
---
${truncatedText}
---`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        maxOutputTokens: 2048
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("No summary generated. The page content might have been filtered or blocked.");
    }
  }

  // Custom premium markdown parser to convert standard markdown into Tailwind-styled HTML elements
  function parseMarkdown(text) {
    if (!text) return "";
    
    // Escape HTML to prevent XSS injection
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Headings
    html = html.replace(/^(?:###)\s+(.+)$/gm, '<h4 class="text-sm font-semibold text-indigo-400 mt-4 mb-2">$1</h4>');
    html = html.replace(/^(?:##)\s+(.+)$/gm, '<h3 class="text-sm font-semibold uppercase tracking-wider text-indigo-400 mt-5 mb-2 pb-1 border-b border-slate-800">$1</h3>');
    html = html.replace(/^(?:#)\s+(.+)$/gm, '<h2 class="text-base font-bold text-purple-400 mt-6 mb-3">$1</h2>');

    // Bold text (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-indigo-300">$1</strong>');
    
    // Bullet points (- or * )
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc pl-1 my-1 text-slate-300">$1</li>');

    // Handle newlines
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function updateKeyStatus(isSaved) {
    if (isSaved) {
      keyStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block mr-1 animate-pulse"></span><span class="text-emerald-400 font-sans">Saved</span>`;
    } else {
      keyStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block mr-1"></span><span class="text-rose-400 font-sans">Not Saved</span>`;
    }
  }

  function showTemporaryStatus(message, type) {
    const originalContent = saveKeyBtn.textContent;
    saveKeyBtn.textContent = message;
    if (type === 'success') {
      saveKeyBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-500');
      saveKeyBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
    } else {
      saveKeyBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-500');
      saveKeyBtn.classList.add('bg-rose-600', 'hover:bg-rose-500');
    }

    setTimeout(() => {
      saveKeyBtn.textContent = originalContent;
      saveKeyBtn.className = 'bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg px-4 py-2 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all font-sans';
    }, 1500);
  }
});
