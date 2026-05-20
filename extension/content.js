(() => {
  const BUTTON_ID = "tubeshelf-btn";
  let currentVideoId = null;

  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("v");
  }

  function removeButton() {
    document.getElementById(BUTTON_ID)?.remove();
  }

  function showToast(message, isError = false) {
    const existing = document.getElementById("tubeshelf-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "tubeshelf-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "80px",
      right: "24px",
      background: isError ? "#c0392b" : "#1a1a2e",
      color: "#fff",
      padding: "12px 18px",
      borderRadius: "8px",
      fontSize: "14px",
      zIndex: "9999",
      maxWidth: "320px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      transition: "opacity 0.3s",
    });

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function createShelfButton() {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.title = "Shelf It — organize into auto-playlists";

    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="round" width="20" height="20">
        <path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
      </svg>
      <span>Shelf It</span>
    `;

    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 14px",
      borderRadius: "18px",
      border: "none",
      background: "#0f0f0f",
      color: "#fff",
      fontSize: "14px",
      fontWeight: "500",
      cursor: "pointer",
      fontFamily: "Roboto, Arial, sans-serif",
      outline: "none",
    });

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#272727";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#0f0f0f";
    });

    btn.addEventListener("click", async () => {
      const videoId = getVideoId();
      if (!videoId) return;

      btn.disabled = true;
      btn.querySelector("span").textContent = "Shelving…";

      const result = await chrome.runtime.sendMessage({
        action: "organize",
        videoId,
      });

      btn.disabled = false;
      btn.querySelector("span").textContent = "Shelf It";

      if (result.ok) {
        const count = result.data.playlists.length;
        const created = result.data.playlists.filter((p) => p.created).length;
        showToast(
          `✓ Added to ${count} playlist${count !== 1 ? "s" : ""}` +
            (created ? ` (${created} new)` : "")
        );
      } else {
        showToast(`✗ ${result.message || "Something went wrong"}`, true);
      }
    });

    return btn;
  }

  function injectButton(videoId) {
    if (document.getElementById(BUTTON_ID)) return;

    // YouTube renders the action bar lazily; target the top-level-buttons area
    const actionBar =
      document.querySelector("#top-level-buttons-computed") ||
      document.querySelector("ytd-menu-renderer.ytd-watch-metadata") ||
      document.querySelector("#actions-inner");

    if (!actionBar) return;

    const btn = createShelfButton();
    actionBar.insertBefore(btn, actionBar.firstChild);
    currentVideoId = videoId;
  }

  function tryInject() {
    const videoId = getVideoId();
    if (!videoId) return;
    if (videoId === currentVideoId && document.getElementById(BUTTON_ID)) return;
    injectButton(videoId);
  }

  // YouTube is a SPA; listen for its own navigation events
  document.addEventListener("yt-navigate-finish", () => {
    removeButton();
    currentVideoId = null;
    // Give React a tick to render the new page
    setTimeout(tryInject, 800);
  });

  // MutationObserver as fallback for cases where action bar renders late
  const observer = new MutationObserver(() => tryInject());
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial inject on page load
  setTimeout(tryInject, 1000);
})();
