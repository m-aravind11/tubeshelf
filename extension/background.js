const API_BASE = "https://tubeshelf-psi.vercel.app";

async function getAccessToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError?.message || "No token");
      } else {
        resolve(token);
      }
    });
  });
}

async function organizeVideo(videoId) {
  let token;
  try {
    token = await getAccessToken(true);
  } catch (err) {
    return { error: "auth_failed", message: String(err) };
  }

  try {
    const resp = await fetch(`${API_BASE}/api/organize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, access_token: token }),
    });

    if (!resp.ok) {
      // Token may be stale — remove it so next call re-auths
      if (resp.status === 401) {
        chrome.identity.removeCachedAuthToken({ token }, () => {});
      }
      const err = await resp.json().catch(() => ({}));
      return { error: "api_error", message: err.detail || resp.statusText };
    }

    const data = await resp.json();

    // Persist last result for popup display
    await chrome.storage.local.set({ lastResult: data, lastResultAt: Date.now() });
    return { ok: true, data };
  } catch (err) {
    return { error: "network_error", message: String(err) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "organize") {
    organizeVideo(msg.videoId).then(sendResponse);
    return true; // keep channel open for async response
  }

  if (msg.action === "getStatus") {
    chrome.storage.local.get(["lastResult", "lastResultAt"], sendResponse);
    return true;
  }

  if (msg.action === "signOut") {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      const finish = () => {
        chrome.storage.local.set({ signedOut: true }, () => sendResponse({ ok: true }));
      };
      if (token) {
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
          .catch(() => {})
          .finally(() => chrome.identity.removeCachedAuthToken({ token }, finish));
      } else {
        finish();
      }
    });
    return true;
  }
});
