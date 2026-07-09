const API_BASE = "https://tubeshelf-psi.vercel.app";

async function getAccessToken() {
  return new Promise((resolve, reject) => {
    // Non-interactive: never pop up a Google sign-in dialog from a page button click.
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

// Posts to the API with the current access token. On a 401 (expired token,
// which happens routinely mid-session since Google tokens last ~1hr), drops
// the stale cached token and retries once with a freshly-fetched one before
// giving up, so the user isn't forced to manually retry every hour.
async function callApi(path, buildBody) {
  if (await isSignedOut()) {
    return { error: "signed_out", message: "Sign in to TubeShelf first, click the extension icon." };
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    return { error: "auth_failed", message: "Sign in to TubeShelf first, click the extension icon." };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(token)),
      });

      if (!resp.ok) {
        if (resp.status === 401 && attempt === 0) {
          chrome.identity.removeCachedAuthToken({ token }, () => {});
          try {
            token = await getAccessToken();
            continue;
          } catch (err) {
            return { error: "auth_failed", message: "Sign in to TubeShelf first, click the extension icon." };
          }
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
}

async function previewVideo(videoId) {
  return callApi("/api/preview", (token) => ({ video_id: videoId, access_token: token }));
}

async function organizeVideo(videoId, title, entries) {
  const result = await callApi("/api/organize", (token) => ({
    video_id: videoId, access_token: token, title, entries,
  }));
  if (result.ok) {
    await chrome.storage.local.set({ lastResult: result.data, lastResultAt: Date.now() });
  }
  return result;
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
