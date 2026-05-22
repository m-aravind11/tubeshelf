const main = document.getElementById("main");
const signOutBtn = document.getElementById("signOut");

function timeAgo(ms) {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function renderNoAccount(errorMsg = "") {
  signOutBtn.style.display = "none";
  main.innerHTML = `
    <div class="not-signed-in">
      <p>Sign in with Google to auto-organize your YouTube &amp; YT Music playlists.</p>
      ${errorMsg ? `<p class="error-msg">${errorMsg}</p>` : ""}
      <button class="btn-primary" id="signInBtn">Sign in with Google</button>
    </div>
  `;
  document.getElementById("signInBtn").addEventListener("click", async () => {
    const btn = document.getElementById("signInBtn");
    btn.disabled = true;
    btn.textContent = "Connecting…";

    const token = await new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: true }, (t) => {
        resolve(chrome.runtime.lastError ? null : t);
      });
    });

    if (token) {
      await chrome.storage.local.remove("extensionSignedOut");
      checkAuthAndLoad();
    } else {
      renderNoAccount("Sign-in failed or was cancelled.");
    }
  });
}

function renderResult(data, lastResultAt) {
  signOutBtn.style.display = "block";

  const playlistsHtml = data.playlists.length
    ? data.playlists
        .map((p) => {
          const badge = p.created
            ? `<span class="badge new">new</span>`
            : p.added
            ? `<span class="badge exists">added</span>`
            : `<span class="badge dup">already in</span>`;
          return `<div class="playlist-item">${badge} <span>${p.name}</span></div>`;
        })
        .join("")
    : `<span class="empty">No metadata found for this video.</span>`;

  main.innerHTML = `
    <div class="status">
      <div class="label">Last shelved</div>
      <div class="value">${data.title || data.video_id}</div>
    </div>
    <div class="playlists">${playlistsHtml}</div>
    <div class="time">${timeAgo(lastResultAt)}</div>
  `;
}

function renderEmpty() {
  signOutBtn.style.display = "block";
  main.innerHTML = `
    <div class="status">
      <div class="label">Last shelved</div>
      <div class="value dim">Nothing yet — open a YouTube song and click "Shelf It".</div>
    </div>
  `;
}

async function checkAuthAndLoad() {
  const { extensionSignedOut } = await chrome.storage.local.get("extensionSignedOut");
  if (extensionSignedOut) {
    renderNoAccount();
    return;
  }

  // Probe for a cached token (non-interactive — no prompt)
  const hasToken = await new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      resolve(!!token && !chrome.runtime.lastError);
    });
  });

  if (!hasToken) {
    renderNoAccount();
    return;
  }

  chrome.runtime.sendMessage({ action: "getStatus" }, ({ lastResult, lastResultAt } = {}) => {
    if (lastResult) {
      renderResult(lastResult, lastResultAt);
    } else {
      renderEmpty();
    }
  });
}

signOutBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "signOut" }, () => {
    renderNoAccount();
  });
});

checkAuthAndLoad();
