(() => {
  const BUTTON_ID = "tubeshelf-btn";
  let currentVideoId = null;

  const isYTMusic = window.location.hostname === "music.youtube.com";

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

    const iconSvg = isError
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="14" height="14" fill="currentColor" style="flex-shrink:0"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="14" height="14" fill="currentColor" style="flex-shrink:0"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>`;

    toast.innerHTML = iconSvg;
    const textNode = document.createElement("span");
    textNode.textContent = message;
    toast.appendChild(textNode);

    Object.assign(toast.style, {
      position: "fixed",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      // YT Music player bar is ~72px tall; clear it
      bottom: isYTMusic ? "96px" : "80px",
      left: "50%",
      transform: "translateX(-50%)",
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

    const baseBg = isYTMusic ? "#212121" : "#0f0f0f";
    const hoverBg = isYTMusic ? "#3a3a3a" : "#272727";

    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 14px",
      borderRadius: "18px",
      border: "none",
      background: baseBg,
      color: "#fff",
      fontSize: "14px",
      fontWeight: "500",
      cursor: "pointer",
      fontFamily: "Roboto, Arial, sans-serif",
      outline: "none",
      // Vertically center inside YT Music's player bar
      alignSelf: "center",
      flexShrink: "0",
    });

    btn.addEventListener("mouseenter", () => { btn.style.background = hoverBg; });
    btn.addEventListener("mouseleave", () => { btn.style.background = baseBg; });

    btn.addEventListener("click", async () => {
      const videoId = getVideoId();
      if (!videoId) return;

      btn.disabled = true;
      btn.querySelector("span").textContent = "Organising your playlists";

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
          `Added to ${count} playlist${count !== 1 ? "s" : ""}` +
            (created ? ` (${created} new)` : "")
        );
      } else {
        showToast(result.message || "Something went wrong", true);
      }
    });

    return btn;
  }

  function getActionBar() {
    if (isYTMusic) {
      // Player bar persists across navigation; target the controls row
      return (
        document.querySelector("ytmusic-player-bar .middle-controls-buttons") ||
        document.querySelector("ytmusic-like-button-renderer")?.parentElement ||
        document.querySelector("ytmusic-player-bar .player-controls") ||
        document.querySelector("ytmusic-player-bar")
      );
    }
    return (
      document.querySelector("#top-level-buttons-computed") ||
      document.querySelector("ytd-menu-renderer.ytd-watch-metadata") ||
      document.querySelector("#actions-inner")
    );
  }

  function injectButton(videoId) {
    if (document.getElementById(BUTTON_ID)) return;

    const actionBar = getActionBar();
    if (!actionBar) return;

    const btn = createShelfButton();
    if (isYTMusic) {
      // Append after existing controls (like/dislike etc.)
      actionBar.appendChild(btn);
    } else {
      actionBar.insertBefore(btn, actionBar.firstChild);
    }
    currentVideoId = videoId;
  }

  function tryInject() {
    const videoId = getVideoId();
    if (!videoId) return;
    if (videoId === currentVideoId && document.getElementById(BUTTON_ID)) return;
    injectButton(videoId);
  }

  document.addEventListener("yt-navigate-finish", () => {
    removeButton();
    currentVideoId = null;
    setTimeout(tryInject, isYTMusic ? 400 : 800);
  });

  // YT Music also fires this on song change within the same page
  if (isYTMusic) {
    document.addEventListener("yt-page-data-updated", () => {
      const videoId = getVideoId();
      if (videoId && videoId !== currentVideoId) {
        removeButton();
        currentVideoId = null;
        setTimeout(tryInject, 400);
      }
    });
  }

  const observer = new MutationObserver(() => tryInject());
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(tryInject, 1000);
})();
