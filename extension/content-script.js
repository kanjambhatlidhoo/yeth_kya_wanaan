(function () {
    const MESSAGE_TYPE_TRANSLATE = "YKW_TRANSLATE_TEXT";
    const MESSAGE_TYPE_OPEN_TRANSLATION = "YKW_OPEN_TRANSLATION";
    const DEFAULT_ERROR_MESSAGE = "Could not translate";
    const POPOVER_HOST_ID = "ykw-translate-host";
    const MAX_PREVIEW_LENGTH = 120;
    const BRAND_IMAGE_URL = chrome.runtime.getURL("assets/sharda.png");

    const state = {
        anchor: null,
        closeButton: null,
        currentMode: "urdu",
        modeButtons: {},
        panel: null,
        payload: null,
        previewText: null,
        requestId: 0,
        resultBody: null,
        resultLabel: null,
        shadowRoot: null,
        statusLine: null,
        tabBar: null
    };

    let latestSelectionDetails = null;

    bootstrap();

    function bootstrap() {
        document.addEventListener("mouseup", onSelectionObserved, true);
        document.addEventListener("keyup", onSelectionObserved, true);
        document.addEventListener("contextmenu", onSelectionObserved, true);
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", onViewportChange, true);
        window.addEventListener("scroll", onViewportChange, true);
        chrome.runtime.onMessage.addListener(onRuntimeMessage);
    }

    function onRuntimeMessage(message) {
        if (!message || message.type !== MESSAGE_TYPE_OPEN_TRANSLATION) {
            return false;
        }

        startTranslationForRequestedText(message.payload);
        return false;
    }

    function onSelectionObserved(event) {
        if (isEventInsidePopover(event)) {
            return;
        }

        if (event.type === "mouseup" && event.button !== 0) {
            return;
        }

        latestSelectionDetails = getSelectionDetails();
    }

    function onPointerDown(event) {
        if (!isPopoverVisible() || isEventInsidePopover(event)) {
            return;
        }

        dismissPopover({ cancelPending: true });
    }

    function onKeyDown(event) {
        if (event.key !== "Escape" || !isPopoverVisible()) {
            return;
        }

        dismissPopover({ cancelPending: true });
    }

    function onViewportChange() {
        if (!isPopoverVisible() || !state.anchor) {
            return;
        }

        const rect = getAnchorRect(state.anchor);

        if (!rect || !doesRectIntersectViewport(rect)) {
            dismissPopover({ cancelPending: true });
            return;
        }

        positionPopover(rect);
    }

    function startTranslationForRequestedText(payload) {
        const requestedText = readSelectedText(payload && payload.text);
        const selectionDetails = resolveSelectionDetails(requestedText);

        if (!selectionDetails) {
            return;
        }

        latestSelectionDetails = selectionDetails;
        startTranslationForSelection(selectionDetails);
    }

    function startTranslationForSelection(selectionDetails) {
        ensurePopover();

        const requestId = state.requestId + 1;
        state.requestId = requestId;
        state.anchor = selectionDetails.anchor;
        state.currentMode = "urdu";
        state.payload = null;

        renderLoading(selectionDetails.text);

        chrome.runtime.sendMessage(
            {
                type: MESSAGE_TYPE_TRANSLATE,
                payload: {
                    text: selectionDetails.text
                }
            },
            (response) => {
                if (requestId !== state.requestId) {
                    return;
                }

                if (chrome.runtime.lastError || !response || !response.ok) {
                    renderError(selectionDetails.text);
                    return;
                }

                renderSuccess(selectionDetails.text, {
                    translatedString: response.translatedString,
                    transliteratedRomanString: response.transliteratedRomanString
                });
            }
        );
    }

    function resolveSelectionDetails(requestedText) {
        if (!requestedText) {
            return null;
        }

        const currentSelectionDetails = getSelectionDetails();
        const currentMatch = resolveSelectionMatch(currentSelectionDetails, requestedText);

        if (currentMatch) {
            return currentMatch;
        }

        const latestMatch = resolveSelectionMatch(latestSelectionDetails, requestedText);

        if (latestMatch) {
            return latestMatch;
        }

        return null;
    }

    function resolveSelectionMatch(selectionDetails, requestedText) {
        if (!selectionDetails) {
            return null;
        }

        const selectedText = readSelectedText(selectionDetails.text);

        if (
            selectedText !== requestedText &&
            normalizeComparableText(selectedText) !== normalizeComparableText(requestedText)
        ) {
            return null;
        }

        return {
            text: requestedText,
            anchor: selectionDetails.anchor
        };
    }

    function getSelectionDetails() {
        return getInputSelectionDetails() || getDocumentSelectionDetails();
    }

    function getDocumentSelectionDetails() {
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return null;
        }

        const text = readSelectedText(selection.toString());

        if (!text) {
            return null;
        }

        const range = selection.getRangeAt(0).cloneRange();
        const rect = getRangeRect(range);

        if (!rect) {
            return null;
        }

        return {
            text,
            anchor: {
                type: "range",
                range
            }
        };
    }

    function getInputSelectionDetails() {
        const activeElement = document.activeElement;

        if (
            !(activeElement instanceof HTMLInputElement) &&
            !(activeElement instanceof HTMLTextAreaElement)
        ) {
            return null;
        }

        if (activeElement instanceof HTMLInputElement && activeElement.type === "password") {
            return null;
        }

        if (
            typeof activeElement.selectionStart !== "number" ||
            typeof activeElement.selectionEnd !== "number" ||
            activeElement.selectionStart === activeElement.selectionEnd
        ) {
            return null;
        }

        const text = readSelectedText(
            activeElement.value.slice(activeElement.selectionStart, activeElement.selectionEnd)
        );

        if (!text) {
            return null;
        }

        const rect = getElementRect(activeElement);

        if (!rect) {
            return null;
        }

        return {
            text,
            anchor: {
                type: "element",
                element: activeElement
            }
        };
    }

    function ensurePopover() {
        if (state.panel) {
            return;
        }

        const host = document.createElement("div");
        host.id = POPOVER_HOST_ID;
        host.style.position = "fixed";
        host.style.inset = "0";
        host.style.zIndex = "2147483647";
        host.style.pointerEvents = "none";

        const shadowRoot = host.attachShadow({ mode: "open" });
        shadowRoot.innerHTML = `
            <style>
                :host {
                    all: initial;
                }

                * {
                    box-sizing: border-box;
                }

                button {
                    font: inherit;
                }

                .panel {
                    position: fixed;
                    width: min(360px, calc(100vw - 24px));
                    padding: 16px;
                    border-radius: 18px;
                    border: 1px solid rgba(148, 163, 184, 0.22);
                    background:
                        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
                    color: #0f172a;
                    box-shadow:
                        0 24px 60px rgba(15, 23, 42, 0.22),
                        0 10px 24px rgba(15, 23, 42, 0.12);
                    backdrop-filter: blur(18px);
                    pointer-events: auto;
                    overflow: hidden;
                }

                .panel::before {
                    content: "";
                    position: absolute;
                    inset: 0 0 auto;
                    height: 4px;
                    background: linear-gradient(90deg, #0f766e, #22c55e, #3b82f6);
                }

                .header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                }

                .brand-block {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    min-width: 0;
                }

                .brand-mark {
                    flex: 0 0 auto;
                    width: 54px;
                    height: 54px;
                    border-radius: 16px;
                    object-fit: cover;
                    background: #ffffff;
                    border: 1px solid rgba(251, 146, 60, 0.24);
                    box-shadow:
                        0 10px 22px rgba(251, 146, 60, 0.16),
                        inset 0 1px 0 rgba(255, 255, 255, 0.7);
                }

                .brand-copy {
                    min-width: 0;
                }

                .eyebrow {
                    font-family: "SF Pro Display", "Segoe UI", sans-serif;
                    font-size: 11px;
                    font-weight: 700;
                    line-height: 1.2;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: #0f766e;
                }

                .preview {
                    margin-top: 8px;
                    padding: 10px 12px;
                    border-radius: 12px;
                    background: rgba(241, 245, 249, 0.92);
                    border: 1px solid rgba(226, 232, 240, 0.95);
                    font-family: "SF Pro Text", "Segoe UI", sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    line-height: 1.4;
                    color: #334155;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .close {
                    appearance: none;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 30px;
                    height: 30px;
                    margin: 0;
                    padding: 0;
                    border: 0;
                    border-radius: 999px;
                    background: rgba(15, 23, 42, 0.06);
                    color: #0f172a;
                    cursor: pointer;
                    transition: background-color 120ms ease, transform 120ms ease;
                }

                .close:hover {
                    background: rgba(15, 23, 42, 0.12);
                    transform: translateY(-1px);
                }

                .close:focus-visible,
                .mode-button:focus-visible {
                    outline: 2px solid rgba(15, 118, 110, 0.45);
                    outline-offset: 2px;
                }

                .tab-bar {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px;
                    margin-top: 14px;
                    padding: 4px;
                    border-radius: 999px;
                    background: rgba(241, 245, 249, 0.95);
                }

                .mode-button {
                    appearance: none;
                    margin: 0;
                    padding: 9px 12px;
                    border: 0;
                    border-radius: 999px;
                    background: transparent;
                    color: #334155;
                    cursor: pointer;
                    font-family: "SF Pro Text", "Segoe UI", sans-serif;
                    font-size: 13px;
                    font-weight: 700;
                    line-height: 1.2;
                    transition:
                        background-color 120ms ease,
                        color 120ms ease,
                        box-shadow 120ms ease,
                        transform 120ms ease;
                }

                .mode-button[data-active="true"] {
                    background: linear-gradient(135deg, #0f766e, #14b8a6);
                    color: #ffffff;
                    box-shadow: 0 10px 22px rgba(20, 184, 166, 0.24);
                }

                .body {
                    margin-top: 14px;
                }

                .status-line {
                    font-family: "SF Pro Text", "Segoe UI", sans-serif;
                    font-size: 12px;
                    font-weight: 700;
                    line-height: 1.2;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    color: #0f766e;
                }

                .result-label {
                    margin-top: 10px;
                    font-family: "SF Pro Text", "Segoe UI", sans-serif;
                    font-size: 12px;
                    font-weight: 600;
                    line-height: 1.3;
                    color: #64748b;
                }

                .result-body {
                    margin-top: 8px;
                    font-family: "Noto Nastaliq Urdu", "Noto Naskh Arabic", "Geeza Pro", serif;
                    font-size: 22px;
                    font-weight: 600;
                    line-height: 1.8;
                    color: #0f172a;
                    word-break: break-word;
                }

                .panel[data-mode="english"] .result-body,
                .panel[data-state="error"] .result-body,
                .panel[data-state="loading"] .result-body {
                    font-family: "Avenir Next", "Segoe UI", sans-serif;
                    font-size: 17px;
                    line-height: 1.6;
                }

                .panel[data-state="error"] .status-line {
                    color: #b91c1c;
                }

                .hidden {
                    display: none !important;
                }
            </style>
            <section class="panel hidden" data-state="loading" data-mode="urdu" role="dialog" aria-live="polite" aria-label="Kashmiri translation">
                <div class="header">
                    <div class="brand-block">
                        <img class="brand-mark" src="${BRAND_IMAGE_URL}" alt="Sharda emblem" />
                        <div class="brand-copy">
                            <div class="eyebrow">Yeth Kya Wanaan</div>
                            <div class="preview"></div>
                        </div>
                    </div>
                    <button class="close" type="button" aria-label="Close translation dialog">✕</button>
                </div>
                <div class="tab-bar hidden" role="tablist" aria-label="Translation mode">
                    <button class="mode-button" data-mode="urdu" type="button" role="tab" aria-selected="true">Urdu</button>
                    <button class="mode-button" data-mode="english" type="button" role="tab" aria-selected="false">English</button>
                </div>
                <div class="body">
                    <div class="status-line"></div>
                    <div class="result-label hidden"></div>
                    <div class="result-body"></div>
                </div>
            </section>
        `;

        document.documentElement.appendChild(host);

        state.shadowRoot = shadowRoot;
        state.panel = shadowRoot.querySelector(".panel");
        state.previewText = shadowRoot.querySelector(".preview");
        state.closeButton = shadowRoot.querySelector(".close");
        state.tabBar = shadowRoot.querySelector(".tab-bar");
        state.statusLine = shadowRoot.querySelector(".status-line");
        state.resultLabel = shadowRoot.querySelector(".result-label");
        state.resultBody = shadowRoot.querySelector(".result-body");
        state.modeButtons = {
            urdu: shadowRoot.querySelector('.mode-button[data-mode="urdu"]'),
            english: shadowRoot.querySelector('.mode-button[data-mode="english"]')
        };

        state.closeButton.addEventListener("click", () => dismissPopover({ cancelPending: true }));
        state.modeButtons.urdu.addEventListener("click", () => switchMode("urdu"));
        state.modeButtons.english.addEventListener("click", () => switchMode("english"));
    }

    function renderLoading(selectedText) {
        state.previewText.textContent = buildPreview(selectedText);
        state.statusLine.textContent = "Translating";
        state.resultBody.textContent = "Fetching from the local translator.";
        state.resultBody.dir = "ltr";
        state.resultBody.lang = "en";
        state.resultLabel.classList.add("hidden");
        state.tabBar.classList.add("hidden");
        state.panel.dataset.state = "loading";
        state.panel.dataset.mode = "urdu";
        showPopover();
    }

    function renderError(selectedText) {
        state.payload = null;
        state.previewText.textContent = buildPreview(selectedText);
        state.statusLine.textContent = "Unavailable";
        state.resultBody.textContent = DEFAULT_ERROR_MESSAGE;
        state.resultBody.dir = "ltr";
        state.resultBody.lang = "en";
        state.resultLabel.classList.add("hidden");
        state.tabBar.classList.add("hidden");
        state.panel.dataset.state = "error";
        state.panel.dataset.mode = "urdu";
        showPopover();
    }

    function renderSuccess(selectedText, payload) {
        state.payload = payload;
        state.currentMode = "urdu";
        state.previewText.textContent = buildPreview(selectedText);
        state.statusLine.textContent = "Translation";
        state.resultLabel.classList.remove("hidden");
        state.tabBar.classList.remove("hidden");
        state.panel.dataset.state = "success";
        updateModeButtons();
        updateResultBody();
        showPopover();
    }

    function switchMode(mode) {
        if (!state.payload || state.currentMode === mode) {
            return;
        }

        state.currentMode = mode;
        updateModeButtons();
        updateResultBody();
        positionFromCurrentAnchor();
    }

    function updateModeButtons() {
        const isUrduActive = state.currentMode === "urdu";

        state.panel.dataset.mode = state.currentMode;
        state.modeButtons.urdu.dataset.active = String(isUrduActive);
        state.modeButtons.english.dataset.active = String(!isUrduActive);
        state.modeButtons.urdu.setAttribute("aria-selected", String(isUrduActive));
        state.modeButtons.english.setAttribute("aria-selected", String(!isUrduActive));
    }

    function updateResultBody() {
        if (!state.payload) {
            return;
        }

        const isUrduMode = state.currentMode === "urdu";

        state.resultLabel.textContent = isUrduMode ? "Urdu" : "English";
        state.resultBody.textContent = isUrduMode
            ? state.payload.translatedString
            : state.payload.transliteratedRomanString;
        state.resultBody.dir = isUrduMode ? "rtl" : "ltr";
        state.resultBody.lang = isUrduMode ? "ur" : "en";
    }

    function showPopover() {
        positionFromCurrentAnchor();
    }

    function dismissPopover(options) {
        const cancelPending = Boolean(options && options.cancelPending);

        if (cancelPending) {
            state.requestId += 1;
        }

        state.anchor = null;

        if (state.panel) {
            state.panel.classList.add("hidden");
        }
    }

    function positionFromCurrentAnchor() {
        const rect = getAnchorRect(state.anchor);

        if (!rect || !doesRectIntersectViewport(rect)) {
            dismissPopover();
            return;
        }

        positionPopover(rect);
    }

    function positionPopover(anchorRect) {
        const margin = 12;

        state.panel.classList.remove("hidden");
        state.panel.style.left = `${margin}px`;
        state.panel.style.top = `${margin}px`;

        const panelRect = state.panel.getBoundingClientRect();
        let left = anchorRect.left + anchorRect.width / 2 - panelRect.width / 2;
        let top = anchorRect.bottom + margin;

        left = clamp(left, margin, window.innerWidth - panelRect.width - margin);

        if (top + panelRect.height > window.innerHeight - margin) {
            top = anchorRect.top - panelRect.height - margin;
        }

        if (top < margin) {
            top = clamp(anchorRect.bottom + margin, margin, window.innerHeight - panelRect.height - margin);
        }

        state.panel.style.left = `${Math.round(left)}px`;
        state.panel.style.top = `${Math.round(top)}px`;
    }

    function getAnchorRect(anchor) {
        if (!anchor) {
            return null;
        }

        if (anchor.type === "range") {
            return getRangeRect(anchor.range);
        }

        if (anchor.type === "element") {
            return getElementRect(anchor.element);
        }

        return null;
    }

    function getRangeRect(range) {
        if (!(range instanceof Range)) {
            return null;
        }

        try {
            const clientRects = Array.from(range.getClientRects()).filter(isRectVisible);

            if (clientRects.length > 0) {
                return clientRects.find(doesRectIntersectViewport) || clientRects[0];
            }

            const boundingRect = range.getBoundingClientRect();
            return isRectVisible(boundingRect) ? boundingRect : null;
        } catch (_error) {
            return null;
        }
    }

    function getElementRect(element) {
        if (!(element instanceof Element) || !element.isConnected) {
            return null;
        }

        const rect = element.getBoundingClientRect();
        return isRectVisible(rect) ? rect : null;
    }

    function isRectVisible(rect) {
        return Boolean(rect) && (rect.width > 0 || rect.height > 0);
    }

    function doesRectIntersectViewport(rect) {
        return Boolean(rect) &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth;
    }

    function isPopoverVisible() {
        return Boolean(state.panel) && !state.panel.classList.contains("hidden");
    }

    function isEventInsidePopover(event) {
        if (!state.shadowRoot) {
            return false;
        }

        return event.composedPath().includes(state.shadowRoot.host);
    }

    function buildPreview(text) {
        const normalizedText = text.replace(/\s+/g, " ").trim();

        if (normalizedText.length <= MAX_PREVIEW_LENGTH) {
            return normalizedText;
        }

        return `${normalizedText.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
    }

    function readSelectedText(text) {
        if (typeof text !== "string") {
            return "";
        }

        return text.trim();
    }

    function normalizeComparableText(text) {
        return readSelectedText(text).replace(/\s+/g, " ");
    }

    function clamp(value, min, max) {
        if (max < min) {
            return min;
        }

        return Math.min(Math.max(value, min), max);
    }
})();
