(() => {
  "use strict";

  // Force the intro state immediately, before any backend/media work starts.
  document.body.classList.add("intro-active", "preloading");
  const bootStory = document.getElementById("story");
  const bootGiftIntro = document.getElementById("giftIntro");
  if (bootStory) {
    bootStory.classList.add("story-hidden");
    bootStory.classList.remove("story-ready");
  }
  if (bootGiftIntro) {
    bootGiftIntro.classList.remove("leave");
    bootGiftIntro.setAttribute("aria-hidden", "false");
  }

  const LOCAL_BACKEND = ["localhost", "127.0.0.1"].includes(location.hostname) && location.port !== "3000";
  const API_BASE = LOCAL_BACKEND ? "http://localhost:3000" : "";
  const API_URL = `${API_BASE}/api/story`;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const DEFAULT_PALETTES = [
    ["#130b26", "#7b2cff", "#ff4fa3"],
    ["#17102c", "#ff4fa3", "#ffbd69"],
    ["#07182b", "#00c8ff", "#8a5cff"],
    ["#20101d", "#ff7a59", "#ffcf70"],
    ["#080f25", "#6e5cff", "#22d3ee"],
  ];

  const DEFAULT_WISHES = [
    "Chúc em sinh nhật thật nhiều niềm vui và những điều bất ngờ dễ thương.",
    "Mong tuổi mới luôn có thật nhiều tiếng cười, yêu thương và bình an.",
    "Mỗi bức ảnh là một khoảnh khắc đáng nhớ trong hành trình thật đẹp của em.",
    "Mong những điều em đang ước sẽ từng bước trở thành hiện thực.",
    "Chúc em luôn khỏe mạnh, hạnh phúc và tự tin trên con đường mình lựa chọn.",
    "Mong mỗi ngày của tuổi mới đều mang đến cho em một lý do để mỉm cười.",
    "Chúc em gặp thật nhiều người tốt, những cơ hội đẹp và những hành trình đáng nhớ.",
    "Tuổi mới rồi — cứ rực rỡ, cứ vui vẻ và cứ là chính mình nhé.",
    "Cảm ơn em vì đã xuất hiện và tạo nên thật nhiều khoảnh khắc đáng yêu.",
    "Happy Birthday! Mong năm nay sẽ là một trong những năm tuyệt vời nhất của em.",
  ];

  function absoluteMediaUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && value != null) el.textContent = value;
  }

  async function loadConfig() {
    const response = await fetch(API_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);

    const raw = await response.json();

    raw.chapters = (raw.chapters || []).map((chapter, index) => ({
      ...chapter,
      palette:
        Array.isArray(chapter.palette) && chapter.palette.length >= 3
          ? chapter.palette
          : DEFAULT_PALETTES[index % DEFAULT_PALETTES.length],
    }));

    if (!raw.chapters.length) {
      raw.chapters = [
        {
          from: 1,
          to: 999999,
          label: "HAPPY BIRTHDAY",
          title: "Những khoảnh khắc đáng nhớ",
          palette: DEFAULT_PALETTES[0],
        },
      ];
    }

    raw.notes =
      Array.isArray(raw.notes) && raw.notes.length
        ? raw.notes
        : Array.isArray(raw.wishes) && raw.wishes.length
          ? raw.wishes
          : DEFAULT_WISHES;

    raw.maxImages =
      Number(raw.maxImages) ||
      Number(raw.counts?.images) ||
      raw.images?.length ||
      0;

    let imageNumber = 0;
    let videoNumber = 0;
    let lastImageNumber = 1;

    raw.media = (raw.media || []).map((item) => {
      if (item.type === "image") {
        imageNumber++;
        lastImageNumber = imageNumber;
        return {
          ...item,
          number: imageNumber,
          src: absoluteMediaUrl(item.url || item.src),
        };
      }

      if (item.type === "video") {
        videoNumber++;
        return {
          ...item,
          number: videoNumber,
          afterImage: lastImageNumber,
          src: absoluteMediaUrl(item.url || item.src),
        };
      }

      return item;
    });

    return raw;
  }

  function showBackendError(error) {
    console.error(error);
    document.body.innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;padding:30px;background:#080713;color:white;font-family:system-ui">
        <div style="max-width:760px;padding:28px;border:1px solid rgba(255,255,255,.18);border-radius:24px;background:rgba(255,255,255,.08)">
          <h2>Không kết nối được backend</h2>
          <p>Frontend đang kết nối tới:</p>
          <code>${escapeHtml(API_URL)}</code>
          <p>Hãy chạy <b>node server.js</b> trong thư mục backend.</p>
          <p style="opacity:.7">${escapeHtml(error?.message || String(error))}</p>
        </div>
      </div>`;
  }

  async function main() {
    let config;
    try {
      config = await loadConfig();
      console.log("✅ BACKEND CONNECTED", config);
    } catch (error) {
      showBackendError(error);
      return;
    }

    if (!Array.isArray(config.media) || !config.media.length) {
      document.body.innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;background:#090712;color:white;font-family:system-ui;text-align:center">
          <div><h1>🎂 Happy Birthday</h1><p>Backend đã chạy nhưng chưa có ảnh/video.</p></div>
        </div>`;
      return;
    }

    setText("coverSubtitle", config.subtitle || "");

    const sheetsWrap = document.getElementById("sheets");
    const stableSpread = document.getElementById("stableSpread");
    const stableLeft = document.getElementById("stableLeft");
    const stableRight = document.getElementById("stableRight");
    const stableFlipOverlay = document.getElementById("stableFlipOverlay");
    const cover = document.getElementById("cover");
    const bar = document.getElementById("progressBar");
    const timelineBar = document.getElementById("timelineBar");
    const chapterPill = document.getElementById("chapterPill");
    const pageCounter = document.getElementById("pageCounter");
    const stageCounter = document.getElementById("stageCounter");
    const bookWrap = document.getElementById("bookWrap");
    const book = document.getElementById("book");
    const flash = document.getElementById("chapterFlash");
    const endingToast = document.getElementById("endingToast");
    const birthdayFinale = document.getElementById("birthdayFinale");
    const roseRain = document.getElementById("roseRain");
    const finaleStars = document.getElementById("finaleStars");
    const finaleConfetti = document.getElementById("finaleConfetti");
    const story = document.getElementById("story");
    const yearPortal = document.getElementById("yearPortal");
    const yearPortalNumber = document.getElementById("yearPortalNumber");
    const yearPortalText = document.getElementById("yearPortalText");
    const yearPortalStars = document.getElementById("yearPortalStars");
    const prevPageBtn = document.getElementById("prevPageBtn");
    const nextPageBtn = document.getElementById("nextPageBtn");
    const navProgress = document.getElementById("navProgress");
    const finaleTitle = document.getElementById("finaleTitle");
    const finaleSubtitle = document.getElementById("finaleSubtitle");
    const finaleMessage = document.getElementById("finaleMessage");
    const finaleFooter = document.getElementById("finaleFooter");

    // V14: Finale copy comes from story.json.
    if (finaleTitle) {
      const title = String(config.finalTitle || "HAPPY BIRTHDAY BÉ THƠM").trim();
      const upper = title.toUpperCase();
      if (upper.includes("BIRTHDAY")) {
        const after = title.replace(/^.*?BIRTHDAY\s*/i, "").trim();
        finaleTitle.innerHTML = `<span>HAPPY</span><span>BIRTHDAY</span>${after ? `<span class="finale-name">${escapeHtml(after)}</span>` : ""}`;
      } else {
        finaleTitle.textContent = title;
      }
    }
    if (finaleSubtitle) finaleSubtitle.textContent = config.finalSubtitle || "Chúc em tuổi 25 thật rực rỡ 🌹";
    if (finaleMessage) {
      finaleMessage.textContent = config.finalMessage || "";
      finaleMessage.hidden = !String(config.finalMessage || "").trim();
    }
    if (finaleFooter) finaleFooter.textContent = config.finalFooter || "WITH LOVE · ALWAYS";

    const chapterFor = (number) =>
      config.chapters.find(
        (chapter) => number >= chapter.from && number <= chapter.to,
      ) || config.chapters[0];

    function imgPage(item) {
      const number = item.number;
      const chapter = chapterFor(number);
      const chapterIndex = number - chapter.from + 1;
      const note = config.notes[(number - 1) % config.notes.length];

      return `
        <div class="memory-page">
          <div class="paper-grain"></div>
          <div class="media-frame photo-frame">
            <img data-src="${escapeHtml(item.src)}" data-image-number="${number}" alt="Kỷ niệm ${number}" loading="eager" decoding="async">
            <div class="media-error" hidden>Không tải được ảnh:<br><b>${escapeHtml(item.fileName || `Ảnh ${number}`)}</b></div>
          </div>
          <div class="page-copy">
            <div>
              <span class="small">${escapeHtml(chapter.title.toUpperCase())} · ${String(chapterIndex).padStart(2, "0")}</span>
              <div class="page-title">Kỷ niệm ${String(number).padStart(2, "0")}</div>
              <div class="page-note">${escapeHtml(note)}</div>
            </div>
            <span class="page-number">${String(number).padStart(2, "0")}</span>
          </div>
          <div class="turn-shadow"></div>
        </div>`;
    }

    function videoPage(item) {
      const chapter = chapterFor(item.afterImage || 1);
      return `
        <div class="memory-page video-page">
          <div class="paper-grain"></div>
          <div class="media-frame video-frame" data-video-number="${item.number}">
            <span class="video-badge">▶ MEMORY FILM ${String(item.number).padStart(2, "0")}</span>
            <video data-src="${escapeHtml(item.src)}" autoplay muted loop playsinline webkit-playsinline preload="metadata"></video>
            <button class="video-control" type="button" aria-label="Play/Pause video">▶</button>
            <div class="video-progress"><i></i></div>
          </div>
          <div class="page-copy">
            <div>
              <span class="small">${escapeHtml(chapter.title.toUpperCase())} · VIDEO</span>
              <div class="page-title">Một thước phim sinh nhật.</div>
              <div class="page-note">Bấm vào bất kỳ đâu trong video để Play/Pause.</div>
            </div>
            <span class="page-number">FILM</span>
          </div>
          <div class="turn-shadow"></div>
        </div>`;
    }

    function yearPage(item) {
      const year = escapeHtml(item.year || "MEMORIES");
      const imageCount = Number(item.countImages || 0);
      const videoCount = Number(item.countVideos || 0);
      return `
        <div class="year-page" data-year-page="${year}">
          <div class="year-page-inner">
            <span class="year-page-kicker">A NEW CHAPTER BEGINS</span>
            <strong class="year-page-number">${year}</strong>
            <div class="year-page-title">Một năm, một chương ký ức.</div>
            <div class="year-page-meta">${imageCount} PHOTOS · ${videoCount} FILMS</div>
            <span class="year-page-scroll">SCROLL TO ENTER ${year} ↓</span>
          </div>
          <div class="turn-shadow"></div>
        </div>`;
    }

    function endPage() {
      return `
        <div class="memory-page">
          <div class="paper-grain"></div>
          <div class="base-inner">
            <span class="small">ONE MORE SURPRISE...</span>
            <h2>Sẵn sàng cho<br>trang cuối chưa?</h2>
            <p>Cuộn thêm một chút nữa nhé. ✨</p>
          </div>
        </div>`;
    }

    const media = [...config.media];
    if (media.length % 2) media.push({ type: "end" });

    sheetsWrap.innerHTML = "";
    const createPage = (item) =>
      !item
        ? endPage()
        : item.type === "image"
          ? imgPage(item)
          : item.type === "video"
            ? videoPage(item)
            : item.type === "year"
              ? yearPage(item)
              : endPage();

    for (let i = 0; i < media.length; i += 2) {
      const sheet = document.createElement("div");
      sheet.className = "sheet";
      sheet.style.zIndex = String(120 - i / 2);
      sheet.innerHTML = `
        <div class="front">${createPage(media[i])}</div>
        <div class="back">${createPage(media[i + 1])}</div>`;
      sheetsWrap.appendChild(sheet);
    }

    // V17 STABLE SPREAD ENGINE
    // The old 3D sheet stack stays in the DOM only as a preload/source cache.
    // It is never painted. The visible book uses two ordinary 2D pages plus
    // one lightweight 2D flip overlay, which avoids Safari's 3D compositor bug.
    sheetsWrap.classList.add("legacy-sheet-cache");


    function stablePageHtml(item) {
      return createPage(item);
    }

    function mediaAt(index) {
      if (index < 0 || index >= media.length) return null;
      return media[index];
    }

    let stableTurn = 0;
    let stableAnimating = false;
    let stableLastDirection = 1;

    function stableVisibleItems(turn) {
      // turn 0 = cover spread.
      if (turn <= 0) return { left: null, right: null, cover: true };
      const base = (turn - 1) * 2;
      return {
        left: mediaAt(base),
        right: mediaAt(base + 1),
        cover: false
      };
    }

    function hydrateStableMedia(root) {
      if (!root) return;
      root.querySelectorAll("img[data-src]").forEach((img) => {
        const src = img.dataset.src;
        if (src && img.getAttribute("src") !== src) img.src = src;
        img.loading = "eager";
        img.decoding = "async";
      });

      root.querySelectorAll("video[data-src]").forEach((video) => {
        const src = video.dataset.src;
        if (!src) return;
        video.autoplay = true;
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("muted", "");
        video.setAttribute("autoplay", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        if (!video.getAttribute("src")) {
          video.src = src;
          try { video.load(); } catch {}
        }
        video.play().catch(() => {});
      });
    }

    function stableCurrentVideoElements() {
      return [
        ...stableLeft?.querySelectorAll("video[data-src]") || [],
        ...stableRight?.querySelectorAll("video[data-src]") || []
      ];
    }

    function syncStableVideos() {
      stableCurrentVideoElements().forEach((video) => {
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.play().catch(() => {});
      });
    }

    function updateStableSpread(turn, animate = false, direction = 1) {
      stableTurn = clamp(Math.round(turn), 0, sheets.length + 1);
      const visible = stableVisibleItems(stableTurn);

      if (visible.cover) {
        stableSpread?.classList.add("is-cover");
        if (stableLeft) stableLeft.innerHTML = `
          <div class="memory-page stable-cover-left">
            <div class="base-inner">
              <span class="small">A BIRTHDAY BOOK</span>
              <h2>Một tuổi mới.<br>Thật nhiều yêu thương.</h2>
              <p>Nhấn Tiếp hoặc cuộn để bắt đầu.</p>
            </div>
          </div>`;
        if (stableRight) stableRight.innerHTML = cover?.querySelector(".cover-front")?.outerHTML || `
          <div class="memory-page"><div class="base-inner"><h2>Happy Birthday!</h2></div></div>`;
      } else {
        stableSpread?.classList.remove("is-cover");
        if (stableLeft) stableLeft.innerHTML = stablePageHtml(visible.left);
        if (stableRight) stableRight.innerHTML = stablePageHtml(visible.right);
      }

      hydrateStableMedia(stableLeft);
      hydrateStableMedia(stableRight);
      syncStableVideos();

      if (animate && stableFlipOverlay && !reduce) {
        stableAnimating = true;
        stableLastDirection = direction >= 0 ? 1 : -1;
        const source = direction >= 0 ? stableRight : stableLeft;
        stableFlipOverlay.innerHTML = source?.innerHTML || "";
        stableFlipOverlay.classList.remove("flip-forward", "flip-backward", "go");
        stableFlipOverlay.classList.add(direction >= 0 ? "flip-forward" : "flip-backward");
        void stableFlipOverlay.offsetWidth;
        stableFlipOverlay.classList.add("go");
        setTimeout(() => {
          stableFlipOverlay.classList.remove("go", "flip-forward", "flip-backward");
          stableFlipOverlay.innerHTML = "";
          stableAnimating = false;
        }, 420);
      }
    }

    /* =========================================================
       V5 STARTUP PRELOADER
       - All photo elements receive their real src before the story is shown.
       - Photos are decoded in a small worker pool so no page opens blank.
       - Videos are warmed to loadeddata/metadata, then the existing visible-video
         manager keeps only the active spread decoding during the story.
       This removes the old 5-image src removal logic that could create empty
       frames during fast 3D page turns.
    ========================================================= */
    const preloadScreen = document.getElementById("preloadScreen");
    const preloadBar = document.getElementById("preloadBar");
    const preloadPercent = document.getElementById("preloadPercent");
    const preloadStatus = document.getElementById("preloadStatus");
    const preloadDetail = document.getElementById("preloadDetail");

    const allImages = [...document.querySelectorAll(".photo-frame img[data-image-number]")];
    const startupVideoItems = config.media.filter((item) => item.type === "video" && item.src);
    const totalStartupUnits = Math.max(1, allImages.length + startupVideoItems.length);
    let startupDone = 0;

    function updateStartupProgress(label = "") {
      const percent = Math.round((startupDone / totalStartupUnits) * 100);
      if (preloadBar) preloadBar.style.width = `${percent}%`;
      if (preloadPercent) preloadPercent.textContent = `${percent}%`;
      if (preloadStatus && label) preloadStatus.textContent = label;
      if (preloadDetail) {
        preloadDetail.textContent = `${startupDone} / ${totalStartupUnits} media đã sẵn sàng`;
      }
    }

    async function preparePhoto(img) {
      const src = img.dataset.src;
      if (!src) return;
      img.src = src;
      img.dataset.loaded = "1";

      try {
        if (!img.complete) {
          await new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        }
        if (img.naturalWidth && typeof img.decode === "function") {
          await img.decode().catch(() => {});
        }
      } catch {}
    }

    async function warmVideoSource(src) {
      await new Promise((resolve) => {
        const video = document.createElement("video");
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          try {
            video.pause();
            video.removeAttribute("src");
            video.load();
          } catch {}
          resolve();
        };

        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.addEventListener("loadeddata", finish, { once: true });
        video.addEventListener("canplay", finish, { once: true });
        video.addEventListener("error", finish, { once: true });
        video.src = src;
        video.load();
        setTimeout(finish, 5000);
      });
    }

    async function runPool(items, worker, concurrency, labelFor) {
      let cursor = 0;
      async function runner() {
        while (cursor < items.length) {
          const index = cursor++;
          const item = items[index];
          await worker(item, index);
          startupDone++;
          updateStartupProgress(labelFor(index + 1, items.length));
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, runner));
    }

    updateStartupProgress("Đang chuẩn bị ảnh...");
    await runPool(
      allImages,
      preparePhoto,
      4,
      (done, total) => `Đang chuẩn bị ảnh ${Math.min(done, total)} / ${total}`,
    );

    await runPool(
      startupVideoItems,
      (item) => warmVideoSource(item.src),
      2,
      (done, total) => `Đang chuẩn bị video ${Math.min(done, total)} / ${total}`,
    );

    startupDone = totalStartupUnits;
    updateStartupProgress("Tất cả kỷ niệm đã sẵn sàng ✨");
    await new Promise((resolve) => setTimeout(resolve, 350));
    preloadScreen?.classList.add("done");
    document.body.classList.remove("preloading");

    // Safari 3D compositor fix: decoded images may remain in a stale/blank texture.
    // Re-assert the real src and force one paint before the book is revealed.
    allImages.forEach((img) => {
      const realSrc = img.dataset.src;
      if (realSrc && img.src !== realSrc) img.src = realSrc;
      img.style.visibility = "visible";
      img.style.opacity = "1";
      void img.offsetWidth;
    });
    document.documentElement.classList.add("media-ready");
    requestAnimationFrame(() => {
      document.documentElement.classList.add("media-painted");
      requestAnimationFrame(() => document.documentElement.classList.remove("media-painted"));
    });

    setTimeout(() => preloadScreen?.remove(), 800);

    document.querySelectorAll(".photo-frame img").forEach((img) => {
      img.addEventListener("error", () => {
        img.style.display = "none";
        const error = img.parentElement.querySelector(".media-error");
        if (error) {
          error.hidden = false;
          error.style.cssText =
            "height:100%;display:grid;place-items:center;text-align:center;color:#967b8c;padding:20px";
        }
      });
    });

    const sheets = [...document.querySelectorAll(".sheet")];
    const sheetCache = [];
    const totalTurns = Math.max(1, Math.ceil(media.length / 2) + 1);

    // V12: button/keyboard navigation. A click advances exactly one book turn,
    // while the existing mouse-wheel / trackpad scrolling remains fully available.
    let navAnimating = false;

    function currentRawPosition() {
      return stableTurn;
    }

    function goToTurn(targetTurn, directionHint = 0) {
      const turn = clamp(Math.round(targetTurn), 0, totalTurns);
      if (turn === stableTurn || stableAnimating) return;
      const direction = directionHint || (turn > stableTurn ? 1 : -1);
      updateStableSpread(turn, true, direction);
      navAnimating = true;
      window.setTimeout(() => { navAnimating = false; }, 430);
      render();
    }

    function nextTurn() {
      goToTurn(Math.min(totalTurns, stableTurn + 1), 1);
    }

    function previousTurn() {
      goToTurn(Math.max(0, stableTurn - 1), -1);
    }

    prevPageBtn?.addEventListener("click", previousTurn);
    nextPageBtn?.addEventListener("click", nextTurn);

    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target && /INPUT|TEXTAREA|SELECT|BUTTON/.test(target.tagName)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        nextTurn();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        previousTurn();
      }
    });

    // Dynamic scroll length: enough room for each page turn without an enormous fixed document.
    story.style.height = `${Math.max(700, totalTurns * 28)}vh`;
    stageCounter.textContent = `0 / ${sheets.length}`;

    /* =========================================================
       OPTIMIZED VIDEO MANAGER
       - Only videos on the visible spread are loaded.
       - Visible videos autoplay MUTED (required by Safari/Chrome).
       - Hidden videos are paused and unloaded to free memory.
       - At most two videos can exist in memory at once.
    ========================================================= */

    const allVideos = [...document.querySelectorAll(".video-frame video")];
    const videoFrames = [...document.querySelectorAll(".video-frame")];
    let lastVideoSpreadKey = "";
    let unloadTimer = null;

    function ensureVideoLoaded(video) {
      if (!video) return;

      const src = video.dataset.src;
      if (!src) return;

      // V13: do not trust dataset.loaded alone. Safari can discard/remove a
      // media source while the flag still says it is loaded.
      const currentSrc = video.getAttribute("src") || "";
      const needsSource = video.dataset.loaded !== "1" || !currentSrc;

      video.autoplay = true;
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("autoplay", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");

      if (needsSource) {
        video.src = src;
        video.dataset.loaded = "1";
        try { video.load(); } catch {}
      }
    }

    function visibleSpreadVideoFrames(raw) {
      // V13 FIX: raw=1 is the first open spread. At that point sheet[0].front
      // is the RIGHT page. The old code used round(raw), which was one sheet
      // ahead and therefore tried to autoplay a hidden video while the visible
      // video stayed black.
      const k = Math.max(0, Math.min(sheets.length, Math.round(raw - 1)));
      const frames = [];

      // Left visible page = back of the last turned sheet.
      if (k > 0) {
        const left = sheets[k - 1]?.querySelector(".back .video-frame");
        if (left) frames.push(left);
      }

      // Right visible page = front of the next sheet.
      if (k < sheets.length) {
        const right = sheets[k]?.querySelector(".front .video-frame");
        if (right) frames.push(right);
      }

      return frames.slice(0, 2);
    }

    let autoplaySettleTimer = null;
    let currentVisibleVideos = [];

    async function safeAutoplay(video) {
      if (!video) return;

      ensureVideoLoaded(video);

      // Required for browser autoplay policy.
      video.autoplay = true;
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("autoplay", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");

      // Try play immediately first. Muted inline video is allowed to autoplay
      // in Safari/Chrome, and waiting before play can lose the user gesture.
      try {
        const promise = video.play();
        if (promise && typeof promise.then === "function") await promise;
        console.log("▶ AUTOPLAY OK:", video.dataset.src);
        return;
      } catch (firstError) {
        // The file may not have decoded its first frame yet. Wait for it once,
        // then retry instead of leaving a permanent black rectangle.
      }

      if (video.readyState < 2) {
        await new Promise((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            video.removeEventListener("loadeddata", done);
            video.removeEventListener("canplay", done);
            resolve();
          };
          video.addEventListener("loadeddata", done, { once: true });
          video.addEventListener("canplay", done, { once: true });
          setTimeout(done, 3500);
        });
      }

      try {
        if (video.paused) await video.play();
        console.log("▶ AUTOPLAY OK AFTER READY:", video.dataset.src);
      } catch (error) {
        console.warn("Autoplay retry needed:", video.dataset.src, error?.name);

        // Safari sometimes needs one more task after layout/compositing settles.
        setTimeout(() => {
          if (currentVisibleVideos.includes(video) && video.paused) {
            video.play().catch((err) => {
              console.warn(
                "Autoplay still blocked:",
                video.dataset.src,
                err?.name,
              );
            });
          }
        }, 350);
      }
    }

    function autoplayVisibleNow() {
      currentVisibleVideos.forEach((video) => {
        if (video.paused) safeAutoplay(video);
      });
    }

    // A wheel/touch/click is a real user gesture. Re-use it to immediately unlock
    // the currently visible muted video on browsers that are stricter about autoplay.
    function unlockVisibleVideoPlayback() {
      currentVisibleVideos.forEach((video) => {
        ensureVideoLoaded(video);
        video.muted = true;
        video.defaultMuted = true;
        video.play().catch(() => {});
      });
    }

    ["pointerdown", "touchstart", "wheel", "keydown"].forEach((eventName) => {
      window.addEventListener(eventName, unlockVisibleVideoPlayback, { passive: true });
    });

    function syncVisibleVideos(raw, force = false) {
      const visibleFrames = visibleSpreadVideoFrames(raw);
      const visibleVideos = visibleFrames
        .map((frame) => frame.querySelector("video"))
        .filter(Boolean);

      currentVisibleVideos = visibleVideos;

      const visibleSet = new Set(visibleVideos);

      // Pause anything not on the visible spread.
      allVideos.forEach((video) => {
        if (!visibleSet.has(video) && !video.paused) {
          video.pause();
        }
      });

      // Prepare visible sources immediately, but do not fight scrolling.
      visibleVideos.forEach((video) => ensureVideoLoaded(video));

      // Key is still useful for cleanup, but autoplay is retried after scroll settles.
      const key = visibleVideos.map((v) => v.dataset.src || "").join("|");
      if (force || key !== lastVideoSpreadKey) {
        lastVideoSpreadKey = key;
      }

      clearTimeout(autoplaySettleTimer);
      autoplaySettleTimer = setTimeout(() => {
        autoplayVisibleNow();
      }, 150);

      // V13 reliability mode: once a video has been visited, keep its src.
      // We pause hidden videos, but do NOT remove src anymore. Removing src was
      // the main reason Safari showed a black frame when revisiting/fast scrolling.
      clearTimeout(unloadTimer);
    }

    /* Optional click/tap:
       autoplay stays muted; clicking a visible video toggles sound.
       This uses a fixed portal outside the 3D transform for Safari reliability. */
    const portalLayer = document.createElement("div");
    portalLayer.className = "video-portal-layer";
    document.body.appendChild(portalLayer);

    const portals = [0, 1].map(() => {
      const portal = document.createElement("button");
      portal.type = "button";
      portal.className = "video-click-portal";
      portal.setAttribute("aria-label", "Bật/tắt âm thanh video");
      portal.innerHTML = '<span class="portal-sound-icon">🔇</span>';
      portalLayer.appendChild(portal);

      const state = { element: portal, video: null };

      portal.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const video = state.video;
        if (!video) return;

        ensureVideoLoaded(video);

        if (video.paused) {
          try {
            await video.play();
          } catch {}
        }

        video.muted = !video.muted;
        portal.classList.toggle("sound-on", !video.muted);

        const icon = portal.querySelector(".portal-sound-icon");
        if (icon) icon.textContent = video.muted ? "🔇" : "🔊";
      });

      return state;
    });

    function bindPortal(state, frame) {
      if (!frame) {
        state.video = null;
        state.element.classList.remove("show", "sound-on");
        state.element.style.width = "0";
        state.element.style.height = "0";
        return;
      }

      const video = frame.querySelector("video");
      const rect = frame.getBoundingClientRect();

      if (
        !video ||
        rect.width < 20 ||
        rect.height < 20 ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        rect.right <= 0 ||
        rect.left >= innerWidth
      ) {
        state.video = null;
        state.element.classList.remove("show", "sound-on");
        return;
      }

      state.video = video;
      state.element.style.left = `${rect.left}px`;
      state.element.style.top = `${rect.top}px`;
      state.element.style.width = `${rect.width}px`;
      state.element.style.height = `${rect.height}px`;
      state.element.classList.add("show");
      state.element.classList.toggle("sound-on", !video.muted);

      const icon = state.element.querySelector(".portal-sound-icon");
      if (icon) icon.textContent = video.muted ? "🔇" : "🔊";
    }

    function refreshVideoPortals(raw) {
      const frames = visibleSpreadVideoFrames(raw);
      bindPortal(portals[0], frames[0] || null);
      bindPortal(portals[1], frames[1] || null);
    }

    videoFrames.forEach((frame) => {
      const video = frame.querySelector("video");
      const progress = frame.querySelector(".video-progress i");
      if (!video) return;

      video.addEventListener("loadstart", () => frame.classList.add("video-loading"));
      video.addEventListener("loadeddata", () => frame.classList.remove("video-loading", "video-error"));
      video.addEventListener("canplay", () => {
        frame.classList.remove("video-loading", "video-error");
        if (currentVisibleVideos.includes(video) && video.paused) safeAutoplay(video);
      });

      video.addEventListener("play", () => frame.classList.add("playing"));
      video.addEventListener("pause", () => {
        frame.classList.remove("playing");

        // If Safari pauses a visible autoplay video during compositing,
        // try again once the page is settled.
        if (!document.hidden && currentVisibleVideos.includes(video)) {
          clearTimeout(autoplaySettleTimer);
          autoplaySettleTimer = setTimeout(() => {
            if (video.paused) safeAutoplay(video);
          }, 220);
        }
      });

      video.addEventListener("timeupdate", () => {
        if (!progress) return;
        const percent =
          Number.isFinite(video.duration) && video.duration > 0
            ? (video.currentTime / video.duration) * 100
            : 0;
        progress.style.width = `${percent}%`;
      });

      video.addEventListener("ended", () => {
        // Keep the page alive: restart short memory clips automatically.
        try {
          video.currentTime = 0;
          video.play().catch(() => {});
        } catch {}
      });

      video.addEventListener("error", () => {
        frame.classList.remove("video-loading");
        frame.classList.add("video-error");
        console.error("❌ VIDEO FILE ERROR:", video.dataset.src, video.error);
      });
    });

    const ease = (t) => t * t * (3 - 2 * t);
    let previousChapter = "";
    let finaleShown = false;
    let lastPortalYear = "";
    let yearPortalTimer = 0;

    if (yearPortalStars && !yearPortalStars.children.length) {
      for (let i = 0; i < 58; i++) {
        const star = document.createElement("b");
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.animationDelay = `${Math.random() * 1.5}s`;
        star.style.opacity = String(.25 + Math.random() * .75);
        yearPortalStars.appendChild(star);
      }
    }

    function showYearPortal(year) {
      if (!yearPortal || !year || year === lastPortalYear) return;
      lastPortalYear = year;
      clearTimeout(yearPortalTimer);
      if (yearPortalNumber) yearPortalNumber.textContent = year;
      if (yearPortalText) yearPortalText.textContent = `Bước vào những kỷ niệm của ${year}...`;
      yearPortal.setAttribute("aria-hidden", "false");
      yearPortal.classList.remove("show");
      void yearPortal.offsetWidth;
      yearPortal.classList.add("show");
      yearPortalTimer = setTimeout(() => {
        yearPortal.classList.remove("show");
        yearPortal.setAttribute("aria-hidden", "true");
      }, 1550);
    }

    function render() {
      const p = totalTurns ? clamp(stableTurn / totalTurns, 0, 1) : 0;
      const raw = stableTurn;
      lastRawForPortals = raw;

      if (bar) bar.style.width = `${p * 100}%`;
      if (timelineBar) timelineBar.style.width = `${p * 100}%`;

      // The legacy cover and sheet stack are never painted in V17.
      if (cover) cover.style.visibility = "hidden";

      const visible = stableVisibleItems(stableTurn);

      // V17.1: restore YEAR chapter effects.
      // A year divider can be on either the left or the right page of a spread.
      // V17 only inspected the right page first, so a year page on the left
      // (for example 2021/2022 depending on media count) could be skipped.
      const yearItem =
        visible.left?.type === "year"
          ? visible.left
          : visible.right?.type === "year"
            ? visible.right
            : null;

      const item = yearItem || visible.right || visible.left || null;

      let currentImage = 1;
      if (item?.type === "image") currentImage = item.number;
      else if (item?.type === "video") currentImage = item.afterImage || 1;

      if (stableTurn <= 0) {
        if (chapterPill) chapterPill.textContent = "HAPPY BIRTHDAY · MỞ MÓN QUÀ";
        if (pageCounter) pageCounter.textContent = "Bìa sinh nhật";
      } else if (item?.type === "year") {
        const y = item.year || "MEMORIES";
        if (chapterPill) chapterPill.textContent = `CHAPTER · ${y}`;
        if (pageCounter) pageCounter.textContent = `Bắt đầu ${y}`;
        showYearPortal(y);
      } else if (item) {
        const chapter = chapterFor(currentImage);
        const y = item?.year ? ` · ${item.year}` : "";
        if (chapterPill) chapterPill.textContent = `${chapter.label}${y}`;
        if (pageCounter) {
          pageCounter.textContent =
            item?.type === "video"
              ? `Video ${String(item.number).padStart(2, "0")}${y}`
              : `Ảnh ${String(currentImage).padStart(2, "0")} / ${config.maxImages}${y}`;
        }

        const [background, color1, color2] = chapter.palette || DEFAULT_PALETTES[0];
        document.body.style.background =
          `radial-gradient(circle at 18% 20%,${color1}55,transparent 30%),` +
          `radial-gradient(circle at 80% 78%,${color2}44,transparent 32%),${background}`;
      }

      if (stageCounter) {
        stageCounter.textContent = `${Math.min(Math.max(stableTurn, 0), totalTurns)} / ${totalTurns}`;
      }
      if (prevPageBtn) prevPageBtn.disabled = stableTurn <= 0;
      if (nextPageBtn) nextPageBtn.disabled = stableTurn >= totalTurns;
      if (navProgress) navProgress.textContent = stableTurn <= 0 ? "BÌA" : `${stableTurn} / ${totalTurns}`;

      syncStableVideos();

      if (p > 0.985 && !finaleShown) {
        finaleShown = true;
        showEndingCelebration();
      }
      if (p < 0.965 && finaleShown) {
        finaleShown = false;
        birthdayFinale?.classList.remove("show");
        birthdayFinale?.setAttribute("aria-hidden", "true");
        document.body.classList.remove("finale-active");
      }
    }

    let lastRawForPortals = 0;
    let scrollAccumulator = 0;
    let scrollLockUntil = 0;

    addEventListener("wheel", (event) => {
      if (document.body.classList.contains("intro-active") || finaleShown) return;
      const now = performance.now();
      if (now < scrollLockUntil) return;

      scrollAccumulator += event.deltaY;
      if (Math.abs(scrollAccumulator) < 70) return;

      const direction = scrollAccumulator > 0 ? 1 : -1;
      scrollAccumulator = 0;
      scrollLockUntil = now + 460;
      if (direction > 0) nextTurn();
      else previousTurn();
    }, { passive: true });

    let touchStartY = null;
    addEventListener("touchstart", (event) => {
      touchStartY = event.touches?.[0]?.clientY ?? null;
    }, { passive: true });

    addEventListener("touchend", (event) => {
      if (touchStartY == null || document.body.classList.contains("intro-active")) return;
      const endY = event.changedTouches?.[0]?.clientY ?? touchStartY;
      const dy = touchStartY - endY;
      touchStartY = null;
      if (Math.abs(dy) < 45) return;
      if (dy > 0) nextTurn();
      else previousTurn();
    }, { passive: true });


    document.addEventListener("click", (event) => {
      const video = event.target.closest?.(".stable-page video");
      if (!video) return;
      video.muted = !video.muted;
      if (video.paused) video.play().catch(() => {});
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        allVideos.forEach((video) => {
          if (!video.paused) video.pause();
        });
      } else {
        syncStableVideos();
      }
    });

    addEventListener(
      "resize",
      () => {},
      { passive: true },
    );

    addEventListener(
      "pointermove",
      (event) => {
        if (reduce || innerWidth < 760) return;
        book.style.transform =
          `rotateX(${-(event.clientY / innerHeight - 0.5) * 2.2}deg) ` +
          `rotateY(${(event.clientX / innerWidth - 0.5) * 2.8}deg)`;
      },
      { passive: true },
    );

    /* BOKEH */
    const bokeh = document.getElementById("bokehLayer");
    if (bokeh) {
      for (let i = 0; i < 6; i++) {
        const particle = document.createElement("i");
        particle.className = "bokeh";
        const size = 12 + Math.random() * 52;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}vw`;
        particle.style.bottom = `${-10 - Math.random() * 70}vh`;
        particle.style.animationDuration = `${10 + Math.random() * 15}s`;
        particle.style.animationDelay = `${-Math.random() * 20}s`;
        particle.style.setProperty("--drift", `${Math.random() * 130 - 65}px`);
        bokeh.appendChild(particle);
      }
    }

    /* STARS */
    const starCanvas = document.getElementById("stars");
    if (starCanvas) {
      const ctx = starCanvas.getContext("2d");
      let stars = [];

      function resizeStars() {
        const dpr = Math.min(devicePixelRatio || 1, 1.5);
        starCanvas.width = innerWidth * dpr;
        starCanvas.height = innerHeight * dpr;
        starCanvas.style.width = `${innerWidth}px`;
        starCanvas.style.height = `${innerHeight}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        stars = Array.from(
          { length: Math.min(30, Math.max(16, Math.floor(innerWidth / 42))) },
          () => ({
            x: Math.random() * innerWidth,
            y: Math.random() * innerHeight,
            r: 0.4 + Math.random() * 1.2,
            a: 0.15 + Math.random() * 0.55,
            s: 0.05 + Math.random() * 0.13,
          }),
        );
      }

      let lastStarFrame = 0;
      function drawStars(now = 0) {
        if (document.hidden) {
          requestAnimationFrame(drawStars);
          return;
        }

        // ~30 FPS is enough for subtle background stars.
        if (now - lastStarFrame < 42) {
          requestAnimationFrame(drawStars);
          return;
        }
        lastStarFrame = now;

        ctx.clearRect(0, 0, innerWidth, innerHeight);
        stars.forEach((star) => {
          star.y += star.s * 1.7;
          if (star.y > innerHeight + 5) star.y = -5;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${star.a})`;
          ctx.fill();
        });
        requestAnimationFrame(drawStars);
      }

      resizeStars();
      drawStars();
      addEventListener("resize", resizeStars, { passive: true });
    }

    /* FIREWORKS */
    const fireworksCanvas = document.getElementById("fireworks");
    let grandFinale = () => {};

    if (fireworksCanvas) {
      const fx = fireworksCanvas.getContext("2d");
      let rockets = [];
      let particles = [];

      const colors = [
        [255, 105, 190],
        [255, 215, 120],
        [105, 220, 255],
        [199, 140, 255],
        [255, 255, 255],
        [115, 255, 183],
        [255, 115, 105],
      ];

      function resizeFireworks() {
        const dpr = Math.min(devicePixelRatio || 1, 1.5);
        fireworksCanvas.width = innerWidth * dpr;
        fireworksCanvas.height = innerHeight * dpr;
        fireworksCanvas.style.width = `${innerWidth}px`;
        fireworksCanvas.style.height = `${innerHeight}px`;
        fx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function explode(x, y, power = 1) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        const count = Math.floor(28 + 24 * power);

        for (let i = 0; i < count; i++) {
          const angle =
            (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.15;
          const speed = (1.5 + Math.random() * 4.6) * power;

          particles.push({
            x,
            y,
            px: x,
            py: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            g: 0.035 + Math.random() * 0.03,
            d: 0.985,
            life: 1,
            dec: 0.009 + Math.random() * 0.013,
            size: 1 + Math.random() * 2.3,
            c: color,
            tw: Math.random() * 6.28,
          });
        }
      }

      function launch(delay = 0) {
        setTimeout(() => {
          rockets.push({
            x: innerWidth * (0.08 + Math.random() * 0.84),
            y: innerHeight + 20,
            px: 0,
            py: 0,
            vx: (Math.random() - 0.5) * 0.7,
            vy: -(8 + Math.random() * 3),
            target: innerHeight * (0.08 + Math.random() * 0.48),
            power: 0.9 + Math.random() * 0.5,
            c: colors[Math.floor(Math.random() * colors.length)],
          });
        }, delay);
      }

      function fireworkShow(amount = 12) {
        for (let i = 0; i < amount; i++) launch(i * 120 + Math.random() * 90);
      }

      grandFinale = () => {
        // V8: three cinematic waves, only at the ending.
        startFireworksLoop();
        fireworkShow(innerWidth < 700 ? 5 : 9);
        setTimeout(() => { startFireworksLoop(); fireworkShow(innerWidth < 700 ? 4 : 7); }, 850);
        setTimeout(() => { startFireworksLoop(); fireworkShow(innerWidth < 700 ? 5 : 10); }, 1850);
        setTimeout(() => { startFireworksLoop(); fireworkShow(innerWidth < 700 ? 3 : 6); }, 3200);
      };

      function animateFireworks() {
        fx.clearRect(0, 0, innerWidth, innerHeight);
        fx.globalCompositeOperation = "lighter";

        for (let i = rockets.length - 1; i >= 0; i--) {
          const rocket = rockets[i];
          rocket.px = rocket.x;
          rocket.py = rocket.y;
          rocket.x += rocket.vx;
          rocket.y += rocket.vy;
          rocket.vy += 0.025;

          fx.beginPath();
          fx.moveTo(rocket.px, rocket.py);
          fx.lineTo(rocket.x, rocket.y + 14);
          fx.strokeStyle = `rgba(${rocket.c.join(",")},.8)`;
          fx.lineWidth = 2;
          fx.stroke();

          if (rocket.y <= rocket.target || rocket.vy >= -1.1) {
            explode(rocket.x, rocket.y, rocket.power);
            rockets.splice(i, 1);
          }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
          const particle = particles[i];
          particle.px = particle.x;
          particle.py = particle.y;
          particle.vx *= particle.d;
          particle.vy *= particle.d;
          particle.vy += particle.g;
          particle.x += particle.vx;
          particle.y += particle.vy;
          particle.life -= particle.dec;
          particle.tw += 0.22;

          const alpha =
            Math.max(0, particle.life) * (0.72 + Math.sin(particle.tw) * 0.28);

          fx.beginPath();
          fx.moveTo(particle.px, particle.py);
          fx.lineTo(particle.x, particle.y);
          fx.strokeStyle = `rgba(${particle.c.join(",")},${alpha})`;
          fx.lineWidth = particle.size;
          fx.shadowBlur = 9;
          fx.shadowColor = `rgba(${particle.c.join(",")},${alpha})`;
          fx.stroke();

          if (particle.life <= 0) particles.splice(i, 1);
        }

        fx.shadowBlur = 0;
        fx.globalCompositeOperation = "source-over";
        if (rockets.length || particles.length) {
          requestAnimationFrame(animateFireworks);
        } else {
          fireworksRunning = false;
        }
      }

      let fireworksRunning = false;
      function startFireworksLoop() {
        if (fireworksRunning) return;
        fireworksRunning = true;
        requestAnimationFrame(animateFireworks);
      }

      resizeFireworks();
      addEventListener("resize", resizeFireworks, { passive: true });
    }

    let finaleDecorBuilt = false;

    function buildFinaleDecor() {
      if (finaleDecorBuilt) return;
      finaleDecorBuilt = true;

      if (roseRain) {
        const count = innerWidth < 700 ? 22 : 42;
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
          const rose = document.createElement("span");
          rose.className = "falling-rose";
          rose.textContent = "🌹";
          rose.style.left = `${Math.random() * 100}%`;
          rose.style.setProperty("--rose-size", `${18 + Math.random() * 34}px`);
          rose.style.setProperty("--rose-drift", `${-130 + Math.random() * 260}px`);
          rose.style.animationDuration = `${5.2 + Math.random() * 6}s`;
          rose.style.animationDelay = `${-Math.random() * 10}s`;
          rose.style.opacity = `${0.46 + Math.random() * 0.5}`;
          fragment.appendChild(rose);
        }
        roseRain.appendChild(fragment);
      }

      if (finaleStars) {
        const count = innerWidth < 700 ? 34 : 66;
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
          const star = document.createElement("i");
          star.className = `finale-star${i % 7 === 0 ? " cross" : ""}`;
          star.style.left = `${2 + Math.random() * 96}%`;
          star.style.top = `${3 + Math.random() * 94}%`;
          star.style.setProperty("--s", `${i % 7 === 0 ? 9 + Math.random() * 12 : 1.5 + Math.random() * 3.5}px`);
          star.style.setProperty("--a", `${0.35 + Math.random() * 0.65}`);
          star.style.setProperty("--d", `${1.2 + Math.random() * 3.1}s`);
          star.style.animationDelay = `${-Math.random() * 4}s`;
          fragment.appendChild(star);
        }
        finaleStars.appendChild(fragment);
      }

      if (finaleConfetti) {
        const colors = ["#ffd36f", "#ff7fc4", "#ffffff", "#8fe4ff", "#c79cff", "#ff6f7e"];
        const count = innerWidth < 700 ? 28 : 62;
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
          const piece = document.createElement("i");
          piece.className = "finale-confetti-piece";
          piece.style.left = `${Math.random() * 100}%`;
          piece.style.setProperty("--c", colors[i % colors.length]);
          piece.style.setProperty("--r", `${Math.random() * 180}deg`);
          piece.style.setProperty("--drift", `${-120 + Math.random() * 240}px`);
          piece.style.setProperty("--t", `${5 + Math.random() * 5}s`);
          piece.style.setProperty("--delay", `${-Math.random() * 9}s`);
          piece.style.width = `${5 + Math.random() * 6}px`;
          piece.style.height = `${9 + Math.random() * 15}px`;
          fragment.appendChild(piece);
        }
        finaleConfetti.appendChild(fragment);
      }
    }

    function showEndingCelebration() {
      document.body.classList.add("finale-active");
      buildFinaleDecor();
      birthdayFinale?.classList.add("show");
      birthdayFinale?.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => grandFinale());

      endingToast?.classList.remove("show");
      endingToast?.setAttribute("aria-hidden", "true");
    }

    /* =========================================================
       OPENING STORY: gift -> 2001 -> 2026 -> 25 -> memory book
    ========================================================= */
    const giftIntro = document.getElementById("giftIntro");
    const openGift = document.getElementById("openGift");
    const introSteps = [...document.querySelectorAll(".intro-step")];
    let introStarted = false;

    function showIntroStep(name) {
      introSteps.forEach((step) => {
        const active = step.dataset.step === name;
        step.classList.toggle("show", active);
        if (!active && step.classList.contains("show")) step.classList.add("hide");
      });
    }

    function activateStep(name) {
      introSteps.forEach((step) => {
        if (step.dataset.step === name) {
          step.classList.remove("hide");
          step.classList.add("show");
        } else if (step.classList.contains("show")) {
          step.classList.remove("show");
          step.classList.add("hide");
        }
      });
    }

    function revealBook() {
      giftIntro?.classList.add("leave");
      document.body.classList.remove("intro-active");
      story?.classList.remove("story-hidden");
      story?.classList.add("story-ready");
      window.scrollTo(0, 0);
      setTimeout(() => giftIntro?.remove(), 900);
      render();
    }

    function startIntro() {
      if (introStarted) return;
      introStarted = true;
      giftIntro?.classList.add("opening");
      if (openGift) openGift.disabled = true;

      setTimeout(() => activateStep("birth"), 700);
      setTimeout(() => activateStep("today"), 2450);
      setTimeout(() => activateStep("age"), 4200);
      setTimeout(() => activateStep("memory"), 5750);
      setTimeout(revealBook, 7600);
    }

    openGift?.addEventListener("click", startIntro, { once: true });
    openGift?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") startIntro();
    });

    updateStableSpread(0, false, 1);
    if (!giftIntro) revealBook();

    render();
  }

  main().catch(showBackendError);
})();
