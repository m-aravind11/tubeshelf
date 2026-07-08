const API_BASE = "https://tubeshelf-psi.vercel.app";

async function getAccessToken() {
  return new Promise((resolve, reject) => {
    // Non-interactive — never pop up a Google sign-in dialog from a page button click.
    // If there's no cached token the user must sign in via the popup explicitly.
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError?.message || "No token");
      } else {
        resolve(token);
      }
    });
  });
}

async function isSignedOut() {
  return new Promise((resolve) => {
    chrome.storage.local.get("extensionSignedOut", ({ extensionSignedOut }) => {
      resolve(!!extensionSignedOut);
    });
  });
}

async function previewVideo(videoId) {
  if (await isSignedOut()) {
    return { error: "signed_out", message: "Sign in to TubeShelf first — click the extension icon." };
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    return { error: "auth_failed", message: "Sign in to TubeShelf first — click the extension icon." };
  }

  try {
    const resp = await fetch(`${API_BASE}/api/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, access_token: token }),
    });

    if (!resp.ok) {
      if (resp.status === 401) {
        chrome.identity.removeCachedAuthToken({ token }, () => {});
      }
      const err = await resp.json().catch(() => ({}));
      return { error: "api_error", message: err.detail || resp.statusText };
    }

    const data = await resp.json();
    return { ok: true, data };
  } catch (err) {
    return { error: "network_error", message: String(err) };
  }
}

async function organizeVideo(videoId, title, entries) {
  if (await isSignedOut()) {
    return { error: "signed_out", message: "Sign in to TubeShelf first — click the extension icon." };
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    return { error: "auth_failed", message: "Sign in to TubeShelf first — click the extension icon." };
  }

  try {
    const resp = await fetch(`${API_BASE}/api/organize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, access_token: token, title, entries }),
    });

    if (!resp.ok) {
      if (resp.status === 401) {
        chrome.identity.removeCachedAuthToken({ token }, () => {});
      }
      const err = await resp.json().catch(() => ({}));
      return { error: "api_error", message: err.detail || resp.statusText };
    }

    const data = await resp.json();
    await chrome.storage.local.set({ lastResult: data, lastResultAt: Date.now() });
    return { ok: true, data };
  } catch (err) {
    return { error: "network_error", message: String(err) };
  }
}

function clearAuthAndSetFlag(callback) {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    const done = () => chrome.storage.local.set({ extensionSignedOut: true }, callback);
    if (token) {
      chrome.identity.removeCachedAuthToken({ token }, done);
    } else {
      done();
    }
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "preview") {
    previewVideo(msg.videoId).then(sendResponse);
    return true;
  }

  if (msg.action === "organize") {
    organizeVideo(msg.videoId, msg.title, msg.entries).then(sendResponse);
    return true;
  }

  if (msg.action === "getStatus") {
    chrome.storage.local.get(["lastResult", "lastResultAt"], sendResponse);
    return true;
  }

  if (msg.action === "signOut") {
    clearAuthAndSetFlag(() => sendResponse({ ok: true }));
    return true;
  }
});

// Auto-logout when the Chrome Google account signs out.
chrome.identity.onSignInChanged.addListener((_account, signedIn) => {
  if (!signedIn) {
    clearAuthAndSetFlag(() => {});
  }
});
