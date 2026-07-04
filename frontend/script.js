/** APPLICATION STATE **/
const AppState = {
    backendUrl: 'https://medagent-x.onrender.com/',
    documents: [], // { id, name, arrayBuffer, pagesCount, mindmapCode, pptData }
    activeDocId: null,
    pdfDoc: null,
    pageNum: 1,
    pptSlides: [],
    currentPptSlide: 0,
};

// DOM Elements
const DOM = {
    landingView: document.getElementById('landing-view'),
    appWorkspace: document.getElementById('app-workspace'),
    apiStatusIndicators: [document.getElementById('api-status-indicator'), document.getElementById('landing-status-indicator')],
    apiStatusTexts: [document.getElementById('api-status-text'), document.getElementById('landing-status-text')],
    btnThemeLanding: document.getElementById('btn-theme-landing'),
    btnThemeApp: document.getElementById('btn-theme-app'),
    btnHome: document.getElementById('btn-home'),
    heroFileUpload: document.getElementById('hero-file-upload'),
    sidebarFileUpload: document.getElementById('sidebar-file-upload'),
    fileList: document.getElementById('file-list'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    pdfCanvas: document.getElementById('pdf-canvas'),
    pdfControls: document.getElementById('pdf-controls'),
    pdfPrev: document.getElementById('pdf-prev'),
    pdfNext: document.getElementById('pdf-next'),
    pdfPageNum: document.getElementById('pdf-page-num'),
    pdfPageCount: document.getElementById('pdf-page-count'),
    mindmapContainer: document.getElementById('mindmap-container'),
    btnRegenGraph: document.getElementById('btn-regen-graph'),
    pptContainer: document.getElementById('ppt-container'),
    pptSlidesContainer: document.getElementById('ppt-slides'),
    pptControls: document.getElementById('ppt-controls'),
    pptPrev: document.getElementById('ppt-prev'),
    pptNext: document.getElementById('ppt-next'),
    pptCurrentNum: document.getElementById('ppt-current-num'),
    pptTotalNum: document.getElementById('ppt-total-num'),
    btnRegenPpt: document.getElementById('btn-regen-ppt'),
    btnDownloadPpt: document.getElementById('btn-download-ppt'),
    chatHistory: document.getElementById('chat-history'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    toastContainer: document.getElementById('toast-container')
};

/** TOAST NOTIFICATION SYSTEM **/
function showToast(message, type = 'info') {
    const toast = document.createElement('div');

    let bgClass = 'bg-gray-800 dark:bg-gray-700';
    let icon = '<i class="ph-fill ph-info text-blue-400"></i>';

    if (type === 'error') {
        bgClass = 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800';
        icon = '<i class="ph-fill ph-warning-circle text-red-500"></i>';
    }

    else if (type === 'success') {
        bgClass = 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800';
        icon = '<i class="ph-fill ph-check-circle text-green-500"></i>';
    }

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${bgClass} text-sm font-medium text-gray-800 dark:text-gray-100 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-auto max-w-sm`;
    toast.innerHTML = `${icon} <span>${message}</span>`;

    DOM.toastContainer.appendChild(toast);

    setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

/** INITIALIZATION & THEME **/
try {
    mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default'
    });
}

catch (e) {

}

function toggleTheme() {
    document.documentElement.classList.toggle('dark');

    try {
        mermaid.initialize({
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default'
        });
    }

    catch (e) {

    }

    if (AppState.activeDocId)
        renderMindMap(false);
}
DOM.btnThemeLanding.addEventListener('click', toggleTheme);
DOM.btnThemeApp.addEventListener('click', toggleTheme);

DOM.btnHome.addEventListener('click', () => {
    DOM.appWorkspace.classList.add('hidden');

    DOM.landingView.classList.remove('hidden');
    DOM.landingView.classList.add('flex');
});

function openWorkspace() {
    DOM.landingView.classList.remove('flex');
    DOM.landingView.classList.add('hidden');

    DOM.appWorkspace.classList.remove('hidden');
    DOM.appWorkspace.classList.add('flex');
}

document.querySelectorAll('.btn-fullscreen').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = e.target.closest('button').dataset.target;

        document.getElementById(targetId).classList.toggle('fullscreen-mode');

        const icon = e.target.closest('button').querySelector('i');
        icon.classList.toggle('ph-corners-out'); icon.classList.toggle('ph-corners-in');
    });
});

DOM.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        DOM.tabBtns.forEach(b => {
            b.classList.remove('active', 'border-b-2', 'border-io-accent', 'text-io-accent');
            b.classList.add('text-gray-500', 'border-transparent');
        });

        btn.classList.add('active', 'border-b-2', 'border-io-accent', 'text-io-accent');
        btn.classList.remove('text-gray-500', 'border-transparent');

        const targetId = btn.dataset.target;

        DOM.tabContents.forEach(content => {
            content.classList.toggle('hidden', content.id !== targetId);
            content.classList.toggle('flex', content.id === targetId);
        });

        if (targetId === 'view-graph' && AppState.activeDocId)
            renderMindMap(false);
    });
});

function showOverlay(text) {
    DOM.loadingText.innerText = text;
    DOM.loadingOverlay.classList.remove('hidden');
    DOM.loadingOverlay.classList.add('flex');
}

function hideOverlay() {
    DOM.loadingOverlay.classList.add('hidden');
    DOM.loadingOverlay.classList.remove('flex');
}

async function checkBackendConnection() {
    try {
        const res = await fetch(`${AppState.backendUrl}/`);

        if (res.ok) {
            DOM.apiStatusIndicators.forEach(el => {
                if (el) {
                    el.classList.replace('bg-red-500', 'bg-green-500');
                    el.classList.replace('shadow-[0_0_8px_#ef4444]', 'shadow-[0_0_8px_#22c55e]');
                }
            });

            DOM.apiStatusTexts.forEach(el => {
                if (el)
                    el.textContent = "Backend Online";
            });
        }
    }

    catch (e) {
        DOM.apiStatusIndicators.forEach(el => {
            if (el) {
                el.classList.replace('bg-green-500', 'bg-red-500');
                el.classList.replace('shadow-[0_0_8px_#22c55e]', 'shadow-[0_0_8px_#ef4444]');
            }
        });

        DOM.apiStatusTexts.forEach(el => {
            if (el)
                el.textContent = "Backend Offline";
        });
    }
}

setTimeout(checkBackendConnection, 500);

/** DOCUMENT UPLOAD & PARSING **/
async function handleFileUpload(file) {
    if (!file)
        return;

    if (file.type !== "application/pdf")
        return showToast("Please upload PDF files only.", "error");

    showOverlay("Uploading to Server...\nChunking & Embedding Document...");

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${AppState.backendUrl}/api/upload`, { method: 'POST', body: formData });

        if (!res.ok) {
            const errorText = await res.json().catch(() => ({
                detail: "Server connection failed."
            }));

            throw new Error(errorText.detail || "Upload failed");
        }

        const data = await res.json();
        const arrayBuffer = await file.arrayBuffer();

        AppState.documents.push({
            id: data.doc_id,
            name: file.name,
            arrayBuffer: arrayBuffer,
            pagesCount: data.pages_count,
            mindmapCode: null,
            pptData: null
        });

        showToast("Document verified and Vectorized successfully!", "success");
        updateSidebarList();

        if (!DOM.landingView.classList.contains('hidden'))
            openWorkspace();

        selectDocument(AppState.documents[AppState.documents.length - 1].id);

    }

    catch (err) {
        showToast(err.message, "error");
    }

    finally {
        hideOverlay();
    }
}

DOM.heroFileUpload.addEventListener('change', (e) => {
    handleFileUpload(e.target.files[0]);
    e.target.value = '';
});

DOM.sidebarFileUpload.addEventListener('change', (e) => {
    handleFileUpload(e.target.files[0]);
    e.target.value = '';
});

function updateSidebarList() {
    if (AppState.documents.length === 0)
        return;

    DOM.fileList.innerHTML = AppState.documents.map(doc => {
        const isActive = AppState.activeDocId === doc.id;

        return `
        <div onclick="selectDocument('${doc.id}')" class="file-item cursor-pointer p-3 rounded-xl text-sm border ${isActive ? 'bg-white dark:bg-gray-800 border-teal-200 dark:border-teal-800/50 shadow-sm' : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50'} transition-all flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg ${isActive ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'} flex items-center justify-center shrink-0 transition-colors"><i class="${isActive ? 'ph-fill' : 'ph'} ph-file-pdf text-lg"></i></div>
            <div class="flex flex-col overflow-hidden">
                <span class="truncate font-medium ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}">${doc.name}</span>
                <span class="text-[10px] text-gray-400 uppercase tracking-wide">${doc.pagesCount} Pages Analyzed</span>
            </div>
        </div>`;

    }).join('');
}

async function selectDocument(docId) {
    AppState.activeDocId = docId; updateSidebarList();
    const doc = AppState.documents.find(d => d.id === docId);

    if (!doc)
        return;

    DOM.pdfCanvas.classList.remove('hidden');
    DOM.pdfControls.classList.remove('hidden');
    DOM.pdfControls.classList.add('flex');

    AppState.pdfDoc = await pdfjsLib.getDocument({
        data: doc.arrayBuffer
    }).promise;

    AppState.pageNum = 1;

    DOM.pdfPageCount.textContent = AppState.pdfDoc.numPages;

    renderPage(AppState.pageNum);

    DOM.mindmapContainer.innerHTML = `<div class="text-center p-8"><div class="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4"><i class="ph-fill ph-tree-structure text-3xl"></i></div><h3 class="text-lg font-bold mb-1">Knowledge Graph</h3><p class="text-sm text-gray-500">Click generate to map relationships.</p></div>`;
    DOM.pptSlidesContainer.innerHTML = `<div class="text-center p-8"><div class="w-16 h-16 bg-purple-50 dark:bg-purple-900/30 text-purple-500 rounded-full flex items-center justify-center mx-auto mb-4"><i class="ph-fill ph-presentation-chart text-3xl"></i></div><h3 class="text-lg font-bold mb-1">Presentation Deck</h3><p class="text-sm text-gray-500">Synthesize this paper into a pitch.</p></div>`;
    DOM.pptControls.classList.add('hidden');
    DOM.chatHistory.innerHTML = '';

    appendMessage('bot', `I have analyzed **${doc.name}**. Ask me any clinical questions, and I will explicitly cite my sources.`);
}

function renderPage(num) {
    AppState.pdfDoc.getPage(num).then(function (page) {
        const containerWidth = DOM.pdfCanvas.parentElement.clientWidth - 32;
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const scale = Math.min(1.5, containerWidth / unscaledViewport.width);
        const viewport = page.getViewport({ scale: scale });

        DOM.pdfCanvas.height = viewport.height; DOM.pdfCanvas.width = viewport.width;

        page.render({ canvasContext: DOM.pdfCanvas.getContext('2d'), viewport: viewport });
    });

    DOM.pdfPageNum.value = num;
}

DOM.pdfPageNum.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        let desiredPage = parseInt(e.target.value);

        if (desiredPage >= 1 && desiredPage <= AppState.pdfDoc.numPages) {
            AppState.pageNum = desiredPage;
            renderPage(AppState.pageNum);
            e.target.blur();
        }

        else {
            e.target.value = AppState.pageNum;
        }
    }
});

DOM.pdfPrev.addEventListener('click', () => {
    if (AppState.pageNum > 1) {
        AppState.pageNum--;
        renderPage(AppState.pageNum);
    }
});

DOM.pdfNext.addEventListener('click', () => {
    if (AppState.pageNum < AppState.pdfDoc.numPages) {
        AppState.pageNum++;
        renderPage(AppState.pageNum);
    }
});

/** API CALL HELPER **/
async function callBackend(endpoint, payload) {
    try {
        const res = await fetch(`${AppState.backendUrl}/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: "Server Error or Timeout" }));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }

        return await res.json();
    }

    catch (e) {
        if (e.message.includes("Failed to fetch"))
            throw new Error("Connection dropped. Ensure backend is running.");

        throw e;
    }
}

/** FEATURE: KNOWLEDGE GRAPH **/
DOM.btnRegenGraph.addEventListener('click', () => renderMindMap(true));
async function renderMindMap(forceRegenerate = false) {
    const doc = AppState.documents.find(d => d.id === AppState.activeDocId);

    if (!doc)
        return showToast("Select a document first.", "error");

    if (forceRegenerate || !doc.mindmapCode) {
        showOverlay("Analyzing Medical Concepts...\nDrawing Knowledge Graph...");

        try {
            const data = await callBackend('generate-graph', { doc_id: doc.id });
            doc.mindmapCode = data.mermaid_code;
        }

        catch (e) {
            showToast(e.message, "error"); hideOverlay(); return;
        }

        hideOverlay();
    }

    try {
        DOM.mindmapContainer.innerHTML = `<div class="mermaid w-full h-full flex justify-center">${doc.mindmapCode}</div>`;

        await mermaid.run();
        const svg = DOM.mindmapContainer.querySelector('svg');

        if (svg) {
            let scale = 1;

            DOM.mindmapContainer.addEventListener('wheel', (e) => {
                e.preventDefault(); scale += e.deltaY * -0.001;
                scale = Math.min(Math.max(0.4, scale), 5);
                svg.style.transform = `scale(${scale})`; svg.style.transition = 'transform 0.1s';
            });
        }
    }

    catch (e) {
        DOM.mindmapContainer.innerHTML = `<div class="text-red-500 p-4"><h3>Mind Map Render Failed</h3><pre class="text-xs mt-2">${doc.mindmapCode}</pre></div>`;
    }
}

/** FEATURE: PPT DECK **/
DOM.btnRegenPpt.addEventListener('click', () => renderPpt(true));
async function renderPpt(forceRegenerate = false) {
    const doc = AppState.documents.find(d => d.id === AppState.activeDocId);

    if (!doc)
        return showToast("Select a document first.", "error");

    if (forceRegenerate || !doc.pptData) {
        showOverlay("Distilling key findings...\nGenerating Presentation Deck...");

        try {
            const data = await callBackend('generate-ppt', { doc_id: doc.id });
            doc.pptData = data.slides;
        }

        catch (e) {
            showToast(e.message, "error"); hideOverlay(); return;
        }

        hideOverlay();
    }

    AppState.pptSlides = doc.pptData;
    AppState.currentPptSlide = 0;

    updatePptView();
}

function updatePptView() {
    if (!AppState.pptSlides || AppState.pptSlides.length === 0)
        return;

    DOM.pptControls.classList.remove('hidden');

    // Show download button now that PPT is generated
    DOM.btnDownloadPpt.classList.remove('hidden');
    DOM.btnDownloadPpt.classList.add('flex');

    DOM.pptTotalNum.textContent = AppState.pptSlides.length;
    DOM.pptCurrentNum.textContent = AppState.currentPptSlide + 1;

    DOM.pptSlidesContainer.innerHTML = AppState.pptSlides.map((slide, index) => {
        const isActive = index === AppState.currentPptSlide;

        return `
        <div class="slide-fade ${isActive ? 'slide-active' : 'slide-hidden'} w-full max-w-2xl bg-white dark:bg-gray-800 p-8 md:p-12 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
            <div class="text-io-accent text-5xl mb-6 flex justify-center"><i class="ph-fill ${slide.icon || 'ph-flask'}"></i></div>
            <h2 class="text-3xl font-bold mb-8 text-gray-900 dark:text-white leading-tight">${slide.title}</h2>
            <ul class="text-left space-y-4">
            ${slide.bullets.map(b => `<li class="flex items-start gap-3 text-lg text-gray-700 dark:text-gray-300"><i class="ph-fill ph-check-circle text-io-accent mt-1.5 shrink-0"></i><span class="leading-relaxed">${b}</span></li>`).join('')}
            </ul>
        </div>
        `;
    }).join('');
}

DOM.pptPrev.addEventListener('click', () => {
    if (AppState.currentPptSlide > 0) {
        AppState.currentPptSlide--;
        updatePptView();
    }
});

DOM.pptNext.addEventListener('click', () => {
    if (AppState.currentPptSlide < AppState.pptSlides.length - 1) {
        AppState.currentPptSlide++;
        updatePptView();
    }
});

// TRIGGER PPTX DOWNLOAD
DOM.btnDownloadPpt.addEventListener('click', async () => {
    const doc = AppState.documents.find(d => d.id === AppState.activeDocId);
    if (!doc)
        return showToast("Select a document first.", "error");

    showToast("Generating PowerPoint file...", "info");

    try {
        const res = await fetch(`${AppState.backendUrl}/api/export-ppt`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({ doc_id: doc.id })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: "Export failed" }));
            throw new Error(err.detail || "Failed to generate PPTX");
        }

        // Convert the backend binary stream into a downloadable file in the browser
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = `${doc.name.replace('.pdf', '')}_Presentation.pptx`;

        document.body.appendChild(a);

        a.click();
        a.remove();

        window.URL.revokeObjectURL(url);

        showToast("Download complete!", "success");
    }

    catch (e) {
        showToast(e.message, "error");
    }
});

/** CHATBOT LOGIC **/
DOM.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = DOM.chatInput.value.trim();

    if (!query)
        return;

    const doc = AppState.documents.find(d => d.id === AppState.activeDocId);

    if (!doc)
        return showToast("Upload a medical document first.", "error");

    appendMessage('user', query);
    DOM.chatInput.value = '';

    const typingIndicatorId = appendTypingIndicator();

    try {
        const data = await callBackend('chat', {
            query: query, doc_id: doc.id
        });

        removeMessage(typingIndicatorId);
        appendMessage('bot', data.reply);
    }

    catch (error) {
        removeMessage(typingIndicatorId);
        appendMessage('bot', `**Connection Error:** ${error.message}`);
    }
});

function appendMessage(sender, text) {
    const div = document.createElement('div');
    div.className = 'flex gap-3';

    if (sender === 'user') {
        div.innerHTML = `<div class="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3.5 rounded-2xl rounded-tr-sm shadow-sm border border-gray-200 dark:border-gray-700 ml-8 text-sm">${marked.parse(text)}</div>
        <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 text-gray-600 dark:text-gray-300"><i class="ph-fill ph-user"></i></div>`;
    }

    else {
        div.innerHTML = `<div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center shrink-0 text-io-accent border border-teal-200 dark:border-teal-800"><i class="ph-fill ph-robot text-lg"></i></div>
        <div class="flex-1 bg-white dark:bg-gray-800 p-3.5 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none leading-relaxed">${marked.parse(text)}</div>`;
    }

    DOM.chatHistory.appendChild(div);
    DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;
}

function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div'); div.id = id; div.className = 'flex gap-3 items-center text-gray-400 text-xs font-medium uppercase tracking-wider';

    div.innerHTML = `<div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center shrink-0 text-io-accent border border-teal-200 dark:border-teal-800 opacity-50"><i class="ph-fill ph-robot text-lg"></i></div>Semantic Search in progress...`;

    DOM.chatHistory.appendChild(div);
    DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;

    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);

    if (el)
        el.remove();
}

DOM.chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        DOM.chatForm.dispatchEvent(new Event('submit'));
    }
});
