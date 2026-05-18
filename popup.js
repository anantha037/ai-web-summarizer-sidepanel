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

  // Summarize Action (Communicates with Background Script)
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
        loadingContainer.classList.add('hidden');
        resultContainer.classList.remove('hidden');

        if (chrome.runtime.lastError) {
          summaryText.innerHTML = `<span class="text-rose-400">Error: ${chrome.runtime.lastError.message}</span>`;
          return;
        }

        if (response && response.error) {
          summaryText.innerHTML = `<span class="text-rose-400">Error: ${response.error}</span>`;
        } else if (response && response.text) {
          // Temporarily show that extraction worked
          const textLength = response.text.length;
          const snippet = response.text.substring(0, 150);
          summaryText.innerHTML = `
            <span class="text-emerald-400 font-semibold block mb-2">✓ Extraction Successful!</span>
            <div class="text-xs text-slate-400 mb-2">Extracted ${textLength} characters from page.</div>
            <div class="italic text-slate-300">"${snippet}..."</div>
          `;
        } else {
          summaryText.innerHTML = `<span class="text-rose-400">Error: No content returned from page.</span>`;
        }
      });
    } else {
      // Fallback for regular web browser testing
      setTimeout(() => {
        loadingContainer.classList.add('hidden');
        resultContainer.classList.remove('hidden');
        summaryText.innerHTML = `
          <span class="text-amber-400 font-semibold block mb-2">⚠ Browser Testing Mode</span>
          <div class="text-xs text-slate-400 mb-2">Extracted 254 characters from mock browser page.</div>
          <div class="italic text-slate-300">"This is a mocked webpage content for testing. Since the extension is running inside a standard web browser rather than as a loaded Chrome Extension, Chrome Extension APIs are unavailable..."</div>
        `;
      }, 1000);
    }
  });

  // Copy to clipboard action
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(summaryText.textContent).then(() => {
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

  function updateKeyStatus(isSaved) {
    if (isSaved) {
      keyStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block mr-1 animate-pulse"></span><span class="text-emerald-400">Saved</span>`;
    } else {
      keyStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block mr-1"></span><span class="text-rose-400">Not Saved</span>`;
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
