document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const keyStatus = document.getElementById('keyStatus');

  const groqApiKeyInput = document.getElementById('groqApiKey');
  const saveGroqKeyBtn = document.getElementById('saveGroqKeyBtn');
  const groqKeyStatus = document.getElementById('groqKeyStatus');

  const engineSelect = document.getElementById('engineSelect');
  const formatSelect = document.getElementById('formatSelect');

  const summarizeBtn = document.getElementById('summarizeBtn');
  const loadingContainer = document.getElementById('loadingContainer');
  const resultContainer = document.getElementById('resultContainer');
  const summaryText = document.getElementById('summaryText');
  const copyBtn = document.getElementById('copyBtn');

  // Q&A DOM Elements
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const chatHistory = document.getElementById('chatHistory');

  // Mini-RAG State variables
  let extractedPageText = "";
  let originalSummary = "";
  let conversationHistory = [];
  let activeTabUrl = "";

  // Load saved preferences & API Keys
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['gemini_api_key', 'groq_api_key', 'active_engine', 'active_format'], (result) => {
      if (result.gemini_api_key) {
        apiKeyInput.value = result.gemini_api_key;
        updateStatusIndicator(keyStatus, true);
      } else {
        updateStatusIndicator(keyStatus, false);
      }

      if (result.groq_api_key) {
        groqApiKeyInput.value = result.groq_api_key;
        updateStatusIndicator(groqKeyStatus, true);
      } else {
        updateStatusIndicator(groqKeyStatus, false);
      }

      if (result.active_engine) {
        engineSelect.value = result.active_engine;
      } else {
        engineSelect.value = 'gemini';
      }

      if (result.active_format) {
        formatSelect.value = result.active_format;
      } else {
        formatSelect.value = 'standard';
      }
    });

    // Query active tab URL to load chat history
    if (chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.url) {
          activeTabUrl = activeTab.url;
          checkPendingSelection(activeTabUrl);
        }
      });
    }
  } else {
    // Fallback for regular web browser testing
    const geminiKey = localStorage.getItem('gemini_api_key');
    const groqKey = localStorage.getItem('groq_api_key');
    const engine = localStorage.getItem('active_engine') || 'gemini';
    const format = localStorage.getItem('active_format') || 'standard';

    if (geminiKey) {
      apiKeyInput.value = geminiKey;
      updateStatusIndicator(keyStatus, true);
    } else {
      updateStatusIndicator(keyStatus, false);
    }

    if (groqKey) {
      groqApiKeyInput.value = groqKey;
      updateStatusIndicator(groqKeyStatus, true);
    } else {
      updateStatusIndicator(groqKeyStatus, false);
    }

    engineSelect.value = engine;
    formatSelect.value = format;

    activeTabUrl = "http://localhost/mock-page";
    checkPendingSelection(activeTabUrl);
  }

  // Save Gemini API Key
  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ gemini_api_key: key }, () => {
          updateStatusIndicator(keyStatus, true);
          showTemporaryStatus(saveKeyBtn, 'Saved!', 'success');
        });
      } else {
        localStorage.setItem('gemini_api_key', key);
        updateStatusIndicator(keyStatus, true);
        showTemporaryStatus(saveKeyBtn, 'Saved!', 'success');
      }
    } else {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['gemini_api_key'], () => {
          updateStatusIndicator(keyStatus, false);
          showTemporaryStatus(saveKeyBtn, 'Cleared!', 'warning');
        });
      } else {
        localStorage.removeItem('gemini_api_key');
        updateStatusIndicator(keyStatus, false);
        showTemporaryStatus(saveKeyBtn, 'Cleared!', 'warning');
      }
    }
  });

  // Save Groq API Key
  saveGroqKeyBtn.addEventListener('click', () => {
    const key = groqApiKeyInput.value.trim();
    if (key) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ groq_api_key: key }, () => {
          updateStatusIndicator(groqKeyStatus, true);
          showTemporaryStatus(saveGroqKeyBtn, 'Saved!', 'success');
        });
      } else {
        localStorage.setItem('groq_api_key', key);
        updateStatusIndicator(groqKeyStatus, true);
        showTemporaryStatus(saveGroqKeyBtn, 'Saved!', 'success');
      }
    } else {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['groq_api_key'], () => {
          updateStatusIndicator(groqKeyStatus, false);
          showTemporaryStatus(saveGroqKeyBtn, 'Cleared!', 'warning');
        });
      } else {
        localStorage.removeItem('groq_api_key');
        updateStatusIndicator(groqKeyStatus, false);
        showTemporaryStatus(saveGroqKeyBtn, 'Cleared!', 'warning');
      }
    }
  });

  // Save Active AI Engine preference
  engineSelect.addEventListener('change', () => {
    const engine = engineSelect.value;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ active_engine: engine });
    } else {
      localStorage.setItem('active_engine', engine);
    }
  });

  // Save Format preference
  formatSelect.addEventListener('change', () => {
    const format = formatSelect.value;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ active_format: format });
    } else {
      localStorage.setItem('active_format', format);
    }
  });

  // Summarize Action (Communicates with Background Script and calls Gemini or Groq API)
  summarizeBtn.addEventListener('click', () => {
    const engine = engineSelect.value;
    const format = formatSelect.value;
    const key = engine === 'gemini' ? apiKeyInput.value.trim() : groqApiKeyInput.value.trim();

    if (!key) {
      alert(`Please save a valid ${engine === 'gemini' ? 'Gemini' : 'Groq'} API Key first!`);
      return;
    }

    // Hide selection badge since we are summarizing the full page now
    const selectionBadge = document.getElementById('selectionBadge');
    if (selectionBadge) selectionBadge.classList.add('hidden');

    // Show loader, hide result
    loadingContainer.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // Communicate with background service worker to extract active tab's text
      chrome.runtime.sendMessage({ action: "extractText" }, (response) => {
        if (chrome.runtime.lastError) {
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = `<span class="error-message">Error: ${chrome.runtime.lastError.message}</span>`;
          return;
        }

        if (response && response.error) {
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = `<span class="error-message">Error: ${response.error}</span>`;
        } else if (response && response.text) {
          // Store extracted text for Q&A context
          extractedPageText = response.text;

          // Reset chat interface
          conversationHistory = [];
          chatHistory.innerHTML = "";
          chatHistory.classList.add('hidden');
          chatInput.value = "";
          saveSession(activeTabUrl);

          // Send active page text to selected API
          const summaryPromise = engine === 'gemini'
            ? generateSummary(key, response.text, format)
            : generateGroqSummary(key, response.text, format);

          summaryPromise
            .then((summary) => {
              originalSummary = summary;
              loadingContainer.classList.add('hidden');
              resultContainer.classList.remove('hidden');
              summaryText.innerHTML = parseMarkdown(summary);
              saveSession(activeTabUrl);
            })
            .catch((err) => {
              loadingContainer.classList.add('hidden');
              resultContainer.classList.remove('hidden');
              summaryText.innerHTML = `<span class="error-message">${engine === 'gemini' ? 'Gemini' : 'Groq'} API Error: ${err.message}</span>`;
            });
        } else {
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = `<span class="error-message">Error: No content returned from page.</span>`;
        }
      });
    } else {
      // Fallback for regular web browser testing
      const mockText = "Tailwind CSS is an open-source utility-first CSS framework. Unlike other CSS frameworks like Bootstrap, it does not provide pre-created classes for elements like buttons or cards. Instead, it provides low-level utility classes that let you build completely custom designs without leaving your HTML. This utility-first approach is incredibly fast, flexible, and extremely powerful for building modern premium user interfaces.";

      extractedPageText = mockText;
      conversationHistory = [];
      chatHistory.innerHTML = "";
      chatHistory.classList.add('hidden');
      chatInput.value = "";
      saveSession(activeTabUrl);

      const summaryPromise = engine === 'gemini'
        ? generateSummary(key, mockText, format)
        : generateGroqSummary(key, mockText, format);

      summaryPromise
        .then((summary) => {
          originalSummary = summary;
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = parseMarkdown(summary);
          saveSession(activeTabUrl);
        })
        .catch((err) => {
          loadingContainer.classList.add('hidden');
          resultContainer.classList.remove('hidden');
          summaryText.innerHTML = `<span class="error-message">${engine === 'gemini' ? 'Gemini' : 'Groq'} API Error: ${err.message}</span>`;
        });
    }
  });

  // Copy to clipboard action
  copyBtn.addEventListener('click', () => {
    // Get text content excluding any HTML formatting
    navigator.clipboard.writeText(summaryText.innerText).then(() => {
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg class="icon icon-xs icon-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span class="text-success">Copied!</span>
      `;
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
      }, 1500);
    });
  });

  // Handle Chat Q&A Interaction
  async function handleChatSubmit() {
    const query = chatInput.value.trim();
    if (!query) return;

    const engine = engineSelect.value;
    const key = engine === 'gemini' ? apiKeyInput.value.trim() : groqApiKeyInput.value.trim();

    if (!key) {
      alert(`Please save a valid ${engine === 'gemini' ? 'Gemini' : 'Groq'} API Key first!`);
      return;
    }

    // Disable input controls during API fetch
    chatInput.disabled = true;
    sendChatBtn.disabled = true;

    // 1. Add User Question Bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-message chat-message-user';
    userBubble.innerHTML = `
      <span class="chat-sender">You</span>
      <div class="chat-bubble bubble-user">
        ${escapeHtml(query)}
      </div>
    `;
    chatHistory.appendChild(userBubble);

    // Show chat history panel if hidden
    chatHistory.classList.remove('hidden');

    // Scroll chat history to bottom
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Clear and reset the input
    chatInput.value = "";

    // 2. Add Bouncing Typing Loader Bubble
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-message chat-message-gemini';
    typingBubble.innerHTML = `
      <span class="chat-sender">${engine === 'gemini' ? 'Gemini' : 'Groq (Llama 3)'}</span>
      <div class="chat-bubble bubble-gemini typing-loader">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    `;
    chatHistory.appendChild(typingBubble);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // 3. Construct API Multi-Turn Chat Payload
    // If it's the first question, we prime the LLM with context & original summary
    if (conversationHistory.length === 0) {
      const firstPrompt = `You are a helpful research assistant. Below is the text content extracted from the active webpage, along with the original summary you previously generated.
Answer the user's follow-up questions accurately based on this content. If the answer cannot be found in the content, use your general knowledge but state that it isn't directly mentioned in the webpage.

Webpage Content:
---
${extractedPageText}
---

Original Page Summary:
${originalSummary}

User's Follow-up Question:
${query}`;

      conversationHistory.push({
        role: "user",
        content: firstPrompt
      });
    } else {
      conversationHistory.push({
        role: "user",
        content: query
      });
    }
    saveSession(activeTabUrl);

    try {
      let answer = "";
      if (engine === 'gemini') {
        answer = await callGeminiChatAPI(key, conversationHistory);
      } else {
        answer = await callGroqChatAPI(key, conversationHistory);
      }

      // Save LLM response to state
      conversationHistory.push({
        role: "assistant",
        content: answer
      });
      saveSession(activeTabUrl);

      // 4. Replace Typing Bubble with real answer
      typingBubble.innerHTML = `
        <span class="chat-sender">${engine === 'gemini' ? 'Gemini' : 'Groq (Llama 3)'}</span>
        <div class="chat-bubble bubble-gemini">
          ${parseMarkdown(answer)}
        </div>
      `;
    } catch (err) {
      // Remove failed user query from conversationHistory to keep thread clean
      conversationHistory.pop();
      saveSession(activeTabUrl);

      // Render API error inside bubble
      typingBubble.innerHTML = `
        <span class="chat-sender">${engine === 'gemini' ? 'Gemini' : 'Groq (Llama 3)'}</span>
        <div class="chat-bubble bubble-gemini bubble-error">
          Error: ${err.message}
        </div>
      `;
    } finally {
      // Re-enable inputs
      chatInput.disabled = false;
      sendChatBtn.disabled = false;
      chatInput.focus();

      // Scroll to bottom
      chatHistory.scrollTop = chatHistory.scrollHeight;
    }
  }

  // Listener wireups for Q&A
  sendChatBtn.addEventListener('click', handleChatSubmit);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleChatSubmit();
    }
  });

  // Call Gemini API inside a chat session
  async function callGeminiChatAPI(apiKey, contentsPayload) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // Map to Gemini wire format
    const geminiPayload = contentsPayload.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: geminiPayload,
        generationConfig: {
          temperature: 0.3,
          topP: 0.95,
          maxOutputTokens: 1024
        }
      })
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
      throw new Error("No answer generated. Content may have violated safety filters.");
    }
  }

  // Call Groq API inside a chat session
  async function callGroqChatAPI(apiKey, contentsPayload) {
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    // Map content payload to Groq/OpenAI structure
    const groqMessages = contentsPayload.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: groqMessages,
        temperature: 0.3,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.choices && data.choices[0]?.message?.content) {
      return data.choices[0].message.content;
    } else {
      throw new Error("No answer generated. Content may have violated safety filters.");
    }
  }

  // Escape HTML helper
  function escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Helper to generate dynamic instructions depending on target format
  function getSummarizationPrompt(pageText, format) {
    let promptGuide = "";
    if (format === 'bullets') {
      promptGuide = `Follow these strict output guidelines:
1. Do NOT write a paragraph summary at the top.
2. Create a "## Key Takeaways" section with 8-12 comprehensive, detailed bullet points capturing the entire essence, facts, and structure of the page content.
3. Keep the tone objective and informative. Avoid phrases like "based on the text" or "this article says". Go straight to the information.`;
    } else if (format === 'eli5') {
      promptGuide = `Follow these strict output guidelines:
1. Summarize the webpage using extremely simple language, analogies, and short sentences, as if explaining to a 5-year-old child (2-3 sentences at the top).
2. Create a "## Simple Explanation" section with 3-5 bullet points breaking down the core concepts in the simplest possible terms.
3. Avoid any technical jargon, complex terms, or acronyms. Keep the tone warm, friendly, and accessible.`;
    } else {
      // 'standard'
      promptGuide = `Follow these strict output guidelines:
1. Provide a professional, engaging summary at the top (2-3 sentences).
2. Create a "## Key Takeaways" section with 4-6 bullet points highlighting the most important facts/insights.
3. If applicable, add a "## Notable Details" section with any key statistics, names, dates, or technical facts.
4. Keep the tone objective and informative. Avoid phrases like "based on the text" or "this article says". Go straight to the information.`;
    }

    return `You are an elite, highly concise webpage summarizer. Below is the text extracted from the active webpage. Please analyze and summarize it.

${promptGuide}

Webpage Content to Summarize:
---
${pageText}
---`;
  }

  // Call Gemini API to generate the summary
  async function generateSummary(apiKey, pageText, format) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // Trim text if it exceeds a reasonable token limit (e.g. ~100k characters)
    const maxChars = 100000;
    const truncatedText = pageText.length > maxChars
      ? pageText.substring(0, maxChars) + "\n...[Content truncated for length]..."
      : pageText;

    const prompt = getSummarizationPrompt(truncatedText, format);

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

  // Call Groq API to generate the summary
  async function generateGroqSummary(apiKey, pageText, format) {
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    // Trim text if it exceeds a reasonable token limit (e.g. ~60k characters for Llama 3 8B context window)
    const maxChars = 60000;
    const truncatedText = pageText.length > maxChars
      ? pageText.substring(0, maxChars) + "\n...[Content truncated for length]..."
      : pageText;

    const prompt = getSummarizationPrompt(truncatedText, format);

    const requestBody = {
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 2048
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.choices && data.choices[0]?.message?.content) {
      return data.choices[0].message.content;
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
    html = html.replace(/^(?:###)\s+(.+)$/gm, '<h4 class="md-h3">$1</h4>');
    html = html.replace(/^(?:##)\s+(.+)$/gm, '<h3 class="md-h2">$1</h3>');
    html = html.replace(/^(?:#)\s+(.+)$/gm, '<h2 class="md-h1">$1</h2>');

    // Bold text (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="md-strong">$1</strong>');

    // Bullet points (- or * )
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li class="md-li">$1</li>');

    // Handle newlines
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function updateStatusIndicator(element, isSaved) {
    if (isSaved) {
      element.innerHTML = `<span class="status-dot status-saved"></span><span class="text-saved">Saved</span>`;
    } else {
      element.innerHTML = `<span class="status-dot status-unsaved"></span><span class="text-unsaved">Not Saved</span>`;
    }
  }

  function showTemporaryStatus(button, message, type) {
    const originalContent = button.textContent;
    button.textContent = message;
    if (type === 'success') {
      button.classList.add('btn-success');
    } else {
      button.classList.add('btn-danger');
    }

    setTimeout(() => {
      button.textContent = originalContent;
      button.classList.remove('btn-success', 'btn-danger');
    }, 1500);
  }

  // Save session details to local storage
  function saveSession(url) {
    if (!url) return;
    const selectionBadge = document.getElementById('selectionBadge');
    const isSelection = selectionBadge ? !selectionBadge.classList.contains('hidden') : false;
    const sessionData = {
      originalSummary,
      extractedPageText,
      conversationHistory,
      isSelection
    };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [`session_${url}`]: sessionData });
    } else {
      localStorage.setItem(`session_${url}`, JSON.stringify(sessionData));
    }
  }

  // Load session details from storage
  function loadSession(url) {
    if (!url) return;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([`session_${url}`], (result) => {
        const data = result[`session_${url}`];
        if (data) {
          restoreSessionData(data);
        }
      });
    } else {
      const raw = localStorage.getItem(`session_${url}`);
      if (raw) {
        try {
          const data = JSON.parse(raw);
          restoreSessionData(data);
        } catch (e) {
          console.error("Failed to load session", e);
        }
      }
    }
  }

  // Restore session data to UI and state variables
  function restoreSessionData(data) {
    if (!data) return;
    originalSummary = data.originalSummary || "";
    extractedPageText = data.extractedPageText || "";
    conversationHistory = data.conversationHistory || [];

    const selectionBadge = document.getElementById('selectionBadge');
    if (originalSummary) {
      // Show summary container
      resultContainer.classList.remove('hidden');
      summaryText.innerHTML = parseMarkdown(originalSummary);
      if (selectionBadge) {
        if (data.isSelection) {
          selectionBadge.classList.remove('hidden');
        } else {
          selectionBadge.classList.add('hidden');
        }
      }
    }

    if (conversationHistory.length > 0) {
      // Show chat history
      chatHistory.classList.remove('hidden');
      chatHistory.innerHTML = "";

      // Reconstruct the chat bubbles
      conversationHistory.forEach((msg, idx) => {
        // Clean display text (strip injected first-prompt headers from user message)
        let displayContent = msg.content;
        if (idx === 0 && msg.role === 'user') {
          const searchStr = "User's Follow-up Question:\n";
          const index = msg.content.indexOf(searchStr);
          if (index !== -1) {
            displayContent = msg.content.substring(index + searchStr.length);
          }
        }

        const bubble = document.createElement('div');
        if (msg.role === 'user') {
          bubble.className = 'chat-message chat-message-user';
          bubble.innerHTML = `
            <span class="chat-sender">You</span>
            <div class="chat-bubble bubble-user">
              ${escapeHtml(displayContent)}
            </div>
          `;
        } else {
          // assistant
          const engine = engineSelect.value;
          bubble.className = 'chat-message chat-message-gemini';
          bubble.innerHTML = `
            <span class="chat-sender">${engine === 'gemini' ? 'Gemini' : 'Groq (Llama 3)'}</span>
            <div class="chat-bubble bubble-gemini">
              ${parseMarkdown(displayContent)}
            </div>
          `;
        }
        chatHistory.appendChild(bubble);
      });

      chatHistory.scrollTop = chatHistory.scrollHeight;
    }
  }

  // Check if there is a pending selection to summarize
  function checkPendingSelection(url) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['pending_selection_text', 'pending_selection_url'], (res) => {
        if (res.pending_selection_text && res.pending_selection_url === url) {
          // Clear immediately to prevent infinite triggers
          chrome.storage.local.remove(['pending_selection_text', 'pending_selection_url']);
          summarizeTextSelection(res.pending_selection_text);
        } else {
          loadSession(url);
        }
      });
    } else {
      const pendingText = localStorage.getItem('pending_selection_text');
      const pendingUrl = localStorage.getItem('pending_selection_url');
      if (pendingText && pendingUrl === url) {
        localStorage.removeItem('pending_selection_text');
        localStorage.removeItem('pending_selection_url');
        summarizeTextSelection(pendingText);
      } else {
        loadSession(url);
      }
    }
  }

  // Handle summarization of a text selection
  function summarizeTextSelection(text) {
    const engine = engineSelect.value;
    const format = formatSelect.value;
    const key = engine === 'gemini' ? apiKeyInput.value.trim() : groqApiKeyInput.value.trim();

    if (!key) {
      alert(`Please save a valid ${engine === 'gemini' ? 'Gemini' : 'Groq'} API Key first!`);
      loadSession(activeTabUrl);
      return;
    }

    loadingContainer.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    const selectionBadge = document.getElementById('selectionBadge');
    if (selectionBadge) selectionBadge.classList.add('hidden');

    extractedPageText = text;
    conversationHistory = [];
    chatHistory.innerHTML = "";
    chatHistory.classList.add('hidden');
    chatInput.value = "";
    saveSession(activeTabUrl);

    const summaryPromise = engine === 'gemini'
      ? generateSummary(key, text, format)
      : generateGroqSummary(key, text, format);

    summaryPromise
      .then((summary) => {
        originalSummary = summary;
        loadingContainer.classList.add('hidden');
        resultContainer.classList.remove('hidden');
        summaryText.innerHTML = parseMarkdown(summary);

        if (selectionBadge) selectionBadge.classList.remove('hidden');
        saveSession(activeTabUrl);
      })
      .catch((err) => {
        loadingContainer.classList.add('hidden');
        resultContainer.classList.remove('hidden');
        summaryText.innerHTML = `<span class="error-message">${engine === 'gemini' ? 'Gemini' : 'Groq'} API Error: ${err.message}</span>`;
      });
  }
});
