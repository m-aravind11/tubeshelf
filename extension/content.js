(() => {
  const BUTTON_ID = "tubeshelf-btn";
  const TOAST_ID = "tubeshelf-toast";
  const isYTMusic = window.location.hostname === "music.youtube.com";

  // Bumped on every navigation so a slow/late response for a video the user
  // has already left doesn't reset the button or pop a modal on the new one.
  let activeRequestId = 0;

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
      bottom: isYTMusic ? "140px" : "128px",
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

  // ── Spinner keyframe ─────────────────────────────────────────────────────

  const style = document.createElement("style");
  style.textContent = "@keyframes ts-spin { to { transform: rotate(360deg); } }";
  (document.head || document.documentElement).appendChild(style);

  function withTimeout(promise, ms = 10000) {
    const timeout = new Promise((resolve) =>
      setTimeout(
        () => resolve({ error: "timeout", message: "Timed out, check your connection and try again." }),
        ms
      )
    );
    return Promise.race([promise, timeout]);
  }

  // ── Confirm modal ────────────────────────────────────────────────────────
  // Lets the user review/edit/remove/add playlist entries before anything
  // is created on YouTube.

  const MODAL_ID = "tubeshelf-modal";
  const CATEGORIES = [
    "Singer",
    "Actor",
    "Director",
    "Music Director",
    "Lyricist",
    "Movie",
    "Year",
    "Decade",
    "Language",
    "Genre",
    "Occasion",
    "Vibe",
  ];

  function buildModal(title, entries) {
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.6)",
      zIndex: "10001",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "Roboto, Arial, sans-serif",
    });

    const box = document.createElement("div");
    Object.assign(box.style, {
      background: "#1a1a2e",
      color: "#fff",
      borderRadius: "12px",
      padding: "20px",
      width: "360px",
      maxWidth: "90vw",
      maxHeight: "80vh",
      overflowY: "auto",
      boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
    });

    const heading = document.createElement("div");
    heading.textContent = title || "Confirm playlists";
    Object.assign(heading.style, {
      fontSize: "15px",
      fontWeight: "600",
      marginBottom: "4px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });

    const subheading = document.createElement("div");
    const alreadyAddedCount = entries.filter((e) => e.already_added).length;
    subheading.textContent = alreadyAddedCount
      ? `Edit before shelving: ${alreadyAddedCount} pre-filled from playlists it's already in:`
      : "Edit before shelving:";
    Object.assign(subheading.style, { fontSize: "12px", color: "#aaa", marginBottom: "12px" });

    const list = document.createElement("div");
    Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" });

    function addRow(category, value, alreadyAdded) {
      const row = document.createElement("div");
      Object.assign(row.style, { display: "flex", gap: "6px", alignItems: "center" });

      const select = document.createElement("select");
      CATEGORIES.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        if (c === category) opt.selected = true;
        select.appendChild(opt);
      });
      Object.assign(select.style, {
        background: "#111",
        color: "#fff",
        border: "1px solid #333",
        borderRadius: "6px",
        fontSize: "12px",
        padding: "6px 20px 6px 8px",
        flexShrink: "0",
        width: "120px",
      });

      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.placeholder = "value";
      Object.assign(input.style, {
        flex: "1",
        minWidth: "0",
        background: "#111",
        color: "#fff",
        border: "1px solid #333",
        borderRadius: "6px",
        fontSize: "13px",
        padding: "6px 8px",
      });

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "×";
      removeBtn.title = "Remove";
      Object.assign(removeBtn.style, {
        background: "none",
        border: "none",
        color: "#e57373",
        fontSize: "18px",
        lineHeight: "1",
        cursor: "pointer",
        padding: "0 4px",
        flexShrink: "0",
      });
      removeBtn.addEventListener("click", () => row.remove());

      row.appendChild(select);
      row.appendChild(input);

      if (alreadyAdded) {
        const badge = document.createElement("span");
        badge.textContent = "already in";
        badge.title = "Prefetched: the video is already in this playlist";
        Object.assign(badge.style, {
          fontSize: "10px",
          color: "#64b5f6",
          background: "#1a1a3a",
          padding: "2px 6px",
          borderRadius: "10px",
          flexShrink: "0",
          whiteSpace: "nowrap",
        });
        row.appendChild(badge);
      }

      row.appendChild(removeBtn);
      list.appendChild(row);
    }

    entries.forEach((e) => addRow(e.category, e.value, e.already_added));
    if (!entries.length) addRow(CATEGORIES[0], "", false);

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add Another Tag";
    addBtn.title = "Note: this creates/updates its own playlist";
    Object.assign(addBtn.style, {
      background: "none",
      border: "1px dashed #444",
      color: "#aaa",
      borderRadius: "6px",
      fontSize: "12px",
      padding: "6px 10px",
      cursor: "pointer",
      marginBottom: "16px",
      width: "100%",
    });
    addBtn.addEventListener("click", () => addRow(CATEGORIES[0], "", false));

    const actions = document.createElement("div");
    Object.assign(actions.style, { display: "flex", gap: "8px", justifyContent: "flex-end" });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    Object.assign(cancelBtn.style, {
      background: "none",
      border: "none",
      color: "#aaa",
      fontSize: "13px",
      padding: "9px 14px",
      cursor: "pointer",
    });

    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "Shelve It";
    Object.assign(confirmBtn.style, {
      background: "#cc0000",
      border: "none",
      color: "#fff",
      fontSize: "13px",
      fontWeight: "600",
      borderRadius: "8px",
      padding: "9px 18px",
      cursor: "pointer",
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    box.appendChild(heading);
    box.appendChild(subheading);
    box.appendChild(list);
    box.appendChild(addBtn);
    box.appendChild(actions);
    overlay.appendChild(box);

    function getEntries() {
      return Array.from(list.children).flatMap((row) => {
        const select = row.querySelector("select");
        const input = row.querySelector("input");
        const category = select.value;
        return input.value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .map((value) => ({ category, value }));
      });
    }

    function setLoading(loading) {
      confirmBtn.disabled = loading;
      cancelBtn.disabled = loading;
      if (loading) {
        const spinner = document.createElement("span");
        spinner.id = "tubeshelf-modal-spinner";
        Object.assign(spinner.style, {
          display: "inline-flex",
          marginRight: "6px",
          animation: "ts-spin 0.7s linear infinite",
        });
        spinner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
        confirmBtn.textContent = "Shelving…";
        confirmBtn.prepend(spinner);
      } else {
        confirmBtn.querySelector("#tubeshelf-modal-spinner")?.remove();
        confirmBtn.textContent = "Shelve It";
      }
    }

    return { overlay, getEntries, setLoading, cancelBtn, confirmBtn };
  }

  // ── Button ───────────────────────────────────────────────────────────────
  // YT Music: fixed-position overlay (its player UI has no stable title slot
  // to anchor to). Regular YouTube: inserted right under the video title.

  const TITLE_SELECTOR = "ytd-watch-metadata #title";

  function createButton() {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.title = "Shelf It: organize into auto-playlists";

    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="round" width="16" height="16">
        <path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
      </svg>
      <span>Shelf It</span>
    `;

    Object.assign(btn.style, {
      zIndex: "9999",
      display: "none",
      alignItems: "center",
      gap: "6px",
      padding: "9px 20px",
      borderRadius: "20px",
      border: "none",
      background: "#cc0000",
      color: "#fff",
      fontSize: "14px",
      fontWeight: "600",
      cursor: "pointer",
      fontFamily: "Roboto, Arial, sans-serif",
      outline: "none",
      boxShadow: "0 3px 12px rgba(0,0,0,0.6)",
      transition: "background 0.15s, transform 0.15s",
      whiteSpace: "nowrap",
    });

    if (isYTMusic) {
      Object.assign(btn.style, {
        position: "fixed",
        bottom: "88px",
        left: "50%",
        transform: "translateX(-50%)",
      });
    } else {
      Object.assign(btn.style, {
        position: "static",
        marginTop: "8px",
      });
    }

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#aa0000";
      btn.style.transform = isYTMusic ? "translateX(-50%) translateY(-2px)" : "translateY(-2px)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#cc0000";
      btn.style.transform = isYTMusic ? "translateX(-50%)" : "";
    });

    function setLoading(loading, label) {
      const iconEl = btn.querySelector("svg");
      const spanEl = btn.querySelector("span");
      btn.disabled = loading;
      if (loading) {
        iconEl.style.display = "none";
        const spinner = document.createElement("span");
        spinner.id = "tubeshelf-spinner";
        Object.assign(spinner.style, {
          display: "inline-flex",
          animation: "ts-spin 0.7s linear infinite",
        });
        spinner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
        btn.insertBefore(spinner, spanEl);
        spanEl.textContent = label;
      } else {
        document.getElementById("tubeshelf-spinner")?.remove();
        iconEl.style.display = "";
        spanEl.textContent = "Shelf It";
      }
    }

    btn.addEventListener("click", async () => {
      const videoId = getVideoId();
      if (!videoId) return;

      document.getElementById(MODAL_ID)?.remove();
      const requestId = ++activeRequestId;
      setLoading(true, "Loading…");
      let result;
      try {
        result = await withTimeout(chrome.runtime.sendMessage({ action: "preview", videoId }));
      } catch (err) {
        result = { error: "extension_error", message: "Extension error, try reloading the page." };
      } finally {
        if (requestId === activeRequestId) setLoading(false);
      }

      // Stale: user navigated to a different video while this was in flight.
      if (requestId !== activeRequestId) return;

      if (!result.ok) {
        showToast(result.message || "Something went wrong", true);
        return;
      }

      const { title, entries } = result.data;
      if (!entries.length) {
        showToast("No metadata found for this video.", true);
        return;
      }

      const modal = buildModal(title, entries);
      document.body.appendChild(modal.overlay);

      modal.cancelBtn.addEventListener("click", () => modal.overlay.remove());
      modal.overlay.addEventListener("click", (e) => {
        if (e.target === modal.overlay) modal.overlay.remove();
      });

      modal.confirmBtn.addEventListener("click", async () => {
        const finalEntries = modal.getEntries();
        if (!finalEntries.length) {
          showToast("Add at least one playlist entry.", true);
          return;
        }

        modal.setLoading(true);

        let organizeResult;
        try {
          organizeResult = await withTimeout(
            chrome.runtime.sendMessage({ action: "organize", videoId, title, entries: finalEntries }),
            45000
          );
        } catch (err) {
          organizeResult = { error: "extension_error", message: "Extension error, try reloading the page." };
        }

        if (organizeResult.ok) {
          modal.overlay.remove();
          const playlists = organizeResult.data.playlists;
          const failed = playlists.filter((p) => !p.playlist_id).length;
          const created = playlists.filter((p) => p.playlist_id && p.created).length;
          const updated = playlists.filter((p) => p.playlist_id && !p.created && p.added).length;
          const alreadyIn = playlists.filter((p) => p.playlist_id && !p.created && !p.added).length;

          let message = `${created} created, ${updated} updated`;
          if (alreadyIn) message += `, ${alreadyIn} already in`;
          if (failed) message += `, ${failed} failed`;
          showToast(message);
        } else {
          modal.setLoading(false);
          showToast(organizeResult.message || "Something went wrong", true);
        }
      });
    });

    if (isYTMusic) {
      document.body.appendChild(btn);
    }
    return { btn, setLoading };
  }

  // ── Visibility ───────────────────────────────────────────────────────────

  const { btn, setLoading: setButtonLoading } = createButton();

  function ensureButtonPlaced() {
    if (isYTMusic) return; // already anchored to document.body once, at creation
    const titleEl = document.querySelector(TITLE_SELECTOR);
    if (titleEl && !titleEl.contains(btn)) {
      titleEl.appendChild(btn);
    }
  }

  // Invalidate any in-flight preview/organize request tied to the video we're
  // leaving, and snap the button back to its idle state for the new one.
  function resetForNavigation() {
    activeRequestId++;
    document.getElementById(MODAL_ID)?.remove();
    setButtonLoading(false);
  }

  function syncVisibility() {
    ensureButtonPlaced();
    btn.style.display = getVideoId() ? "inline-flex" : "none";
  }

  syncVisibility();

  // URL changes (SPA navigation)
  document.addEventListener("yt-navigate-finish", () => {
    resetForNavigation();
    syncVisibility();
  });
  document.addEventListener("yt-page-data-updated", syncVisibility);

  // Fallback: autoplay advancing to the next track (e.g. from a radio/mix
  // queue) doesn't reliably fire the events above, so poll the URL directly.
  // Also retry placement every tick even without a URL change, since on
  // first load the title node can mount after this script runs.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      resetForNavigation();
      syncVisibility();
    }
    ensureButtonPlaced();
  }, 800);
})();
