(() => {
  const BUTTON_ID = "tubeshelf-btn";
  const TOAST_ID = "tubeshelf-toast";
  const isYTMusic = window.location.hostname === "music.youtube.com";

  function getVideoId() {
    return new URLSearchParams(window.location.search).get("v");
  }

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(message, isError = false) {
    document.getElementById(TOAST_ID)?.remove();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;

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
      bottom: isYTMusic ? "96px" : "80px",
      left: "50%",
      transform: "translateX(-50%)",
      background: isError ? "#c0392b" : "#1a1a2e",
      color: "#fff",
      padding: "12px 18px",
      borderRadius: "8px",
      fontSize: "14px",
      zIndex: "10000",
      maxWidth: "320px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      transition: "opacity 0.3s",
      pointerEvents: "none",
    });

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ── Button ───────────────────────────────────────────────────────────────
  // Fixed-position overlay — no dependency on YouTube's DOM structure.

  function createButton() {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.title = "Shelf It — organize into auto-playlists";

    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="round" width="16" height="16">
        <path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
      </svg>
      <span>Shelf It</span>
    `;

    Object.assign(btn.style, {
      position: "fixed",
      bottom: isYTMusic ? "88px" : "76px",
      right: "16px",
      zIndex: "9999",
      display: "none",
      alignItems: "center",
      gap: "6px",
      padding: "7px 14px",
      borderRadius: "18px",
      border: "none",
      background: "rgba(26,26,46,0.92)",
      color: "#fff",
      fontSize: "13px",
      fontWeight: "500",
      cursor: "pointer",
      fontFamily: "Roboto, Arial, sans-serif",
      outline: "none",
      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
      backdropFilter: "blur(4px)",
      transition: "opacity 0.15s, transform 0.15s",
    });

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(40,40,70,0.97)";
      btn.style.transform = "translateY(-1px)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(26,26,46,0.92)";
      btn.style.transform = "";
    });

    btn.addEventListener("click", async () => {
      const videoId = getVideoId();
      if (!videoId) return;

      btn.disabled = true;
      btn.querySelector("span").textContent = "Shelving…";

      const result = await chrome.runtime.sendMessage({ action: "organize", videoId });

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

    document.body.appendChild(btn);
    return btn;
  }

  // ── Visibility ───────────────────────────────────────────────────────────

  const btn = createButton();

  function syncVisibility() {
    btn.style.display = getVideoId() ? "inline-flex" : "none";
  }

  syncVisibility();

  // URL changes (SPA navigation)
  document.addEventListener("yt-navigate-finish", syncVisibility);
  document.addEventListener("yt-page-data-updated", syncVisibility);

  // Fallback: watch for URL changes not covered by YT events
  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      syncVisibility();
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
