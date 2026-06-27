/** APPLICATION STATE **/
const AppState = {
    backendUrl: 'https://medagent-x.onrender.com',
    documents: [], // { id, name, file, arrayBuffer, mindmapCode, pptData }
    activeDocId: null,
    pdfDoc: null,
    pageNum: 1,
    pptSlides: [],
    currentPptSlide: 0,
};

// DOM Elements
const DOM = {
    apiStatusIndicator: document.getElementById('api-status-indicator'),
    btnTheme: document.getElementById('btn-theme'),
    fileUpload: document.getElementById('file-upload'),
    fileList: document.getElementById('file-list'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),

    // PDF
    pdfCanvas: document.getElementById('pdf-canvas'),
    pdfControls: document.getElementById('pdf-controls'),
    pdfEmptyState: document.getElementById('pdf-empty-state'),
    pdfPrev: document.getElementById('pdf-prev'),
    pdfNext: document.getElementById('pdf-next'),
    pdfPageNum: document.getElementById('pdf-page-num'),
    pdfPageCount: document.getElementById('pdf-page-count'),

    // Mindmap
    mindmapContainer: document.getElementById('mindmap-container'),
    btnRegenGraph: document.getElementById('btn-regen-graph'),

    // PPT
    pptContainer: document.getElementById('ppt-container'),
    pptSlidesContainer: document.getElementById('ppt-slides'),
    pptControls: document.getElementById('ppt-controls'),
    pptPrev: document.getElementById('ppt-prev'),
    pptNext: document.getElementById('ppt-next'),
    pptCurrentNum: document.getElementById('ppt-current-num'),
    pptTotalNum: document.getElementById('ppt-total-num'),
    btnRegenPpt: document.getElementById('btn-regen-ppt'),

    // Chat
    chatHistory: document.getElementById('chat-history'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),

    // Overlay
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text')
};

/** INITIALIZATION & THEME **/
try {
    mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default'
    });
}

catch (e) {
    console.warn("Mermaid failed to initialize", e);
}

// THEME TOGGLE LOGIC
DOM.btnTheme.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');

    try {
        mermaid.initialize({
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default'
        });
    }

    catch (e) { }

    if (AppState.activeDocId) {
        renderMindMap(false); // Re-render for color change without API call
    }
});

// Fullscreen logic
document.querySelectorAll('.btn-fullscreen').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = e.target.closest('button').dataset.target;
        const container = document.getElementById(targetId);

        container.classList.toggle('fullscreen-mode');

        // Toggle icon
        const icon = e.target.closest('button').querySelector('i');

        if (container.classList.contains('fullscreen-mode')) {
            icon.classList.replace('ph-corners-out', 'ph-corners-in');
        }

        else {
            icon.classList.replace('ph-corners-in', 'ph-corners-out');
        }
    });
});

// Tabs logic
DOM.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        DOM.tabBtns.forEach(b => {
            b.classList.remove('active', 'border-b-2', 'border-io-accent', 'text-io-accent');
            b.classList.add('text-gray-500');
        });

        btn.classList.add('active', 'border-b-2', 'border-io-accent', 'text-io-accent');
        btn.classList.remove('text-gray-500');

        const targetId = btn.dataset.target;

        DOM.tabContents.forEach(content => {
            if (content.id === targetId)
                content.classList.replace('hidden', 'flex');
            else
                content.classList.replace('flex', 'hidden');
        });

        // Trigger resize for canvas/graph if needed
        if (targetId === 'view-graph' && AppState.activeDocId) {
            renderMindMap(false);
        }
    });
});

function showOverlay(text) {
    DOM.loadingText.innerText = text;
    DOM.loadingOverlay.classList.replace('hidden', 'flex');
}

function hideOverlay() {
    DOM.loadingOverlay.classList.replace('flex', 'hidden');
}

// Check Backend Connection
async function checkBackendConnection() {
    const statusText = DOM.apiStatusIndicator ? DOM.apiStatusIndicator.nextElementSibling : null;

    try {
        const res = await fetch(`${AppState.backendUrl}/`);

        if (res.ok && DOM.apiStatusIndicator) {
            DOM.apiStatusIndicator.classList.replace('bg-red-500', 'bg-green-500');
            DOM.apiStatusIndicator.classList.add('shadow-[0_0_8px_#22c55e]');

            if (statusText) statusText.textContent = "Backend Connected";
        }
    }

    catch (e) {
        if (DOM.apiStatusIndicator) {
            DOM.apiStatusIndicator.classList.replace('bg-green-500', 'bg-red-500');
            DOM.apiStatusIndicator.classList.remove('shadow-[0_0_8px_#22c55e]');

            if (statusText)
                statusText.textContent = "Backend Disconnected";
        }

        console.warn("Backend not connected");
    }
}

checkBackendConnection();

/** DOCUMENT UPLOAD & PARSING **/
DOM.fileUpload.addEventListener('change', async (e) => {
    const files = e.target.files;

    if (!files.length)
        return;

    showOverlay("Uploading to MedAgent-X Backend...\nParsing Medical PDF...");

    for (let file of files) {
        if (file.type !== "application/pdf") {
            alert(`${file.name} is not a PDF. Please upload PDFs only.`);
            continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${AppState.backendUrl}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const errorText = await res.json();
                throw new Error(errorText.detail || "Failed to upload document");
            }

            const data = await res.json();

            // Read PDF array buffer for local rendering
            const arrayBuffer = await file.arrayBuffer();

            AppState.documents.push({
                id: data.doc_id,
                name: file.name,
                file: file,
                arrayBuffer: arrayBuffer,
                mindmapCode: null,
                pptData: null
            });
        }

        catch (e) {
            alert(`Failed to upload ${file.name}: ${e.message}`);
        }
    }

    updateSidebarList();
    hideOverlay();

    // Auto select first uploaded if none active
    if (AppState.documents.length > 0 && !AppState.activeDocId) {
        selectDocument(AppState.documents[0].id);
    }
});

function updateSidebarList() {
    if (AppState.documents.length === 0) {
        DOM.fileList.innerHTML = `<div class="text-center text-gray-400 text-sm mt-10 px-4">No documents uploaded.</div>`;
        return;
    }

    DOM.fileList.innerHTML = AppState.documents.map(doc => `
        <div onclick="selectDocument('${doc.id}')" class="file-item cursor-pointer p-3 rounded-md text-sm border border-transparent ${AppState.activeDocId === doc.id ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'} transition-colors flex items-center gap-2 truncate">
            <i class="ph-fill ph-file-pdf text-red-500"></i>
            <span class="truncate" title="${doc.name}">${doc.name}</span>
        </div>
    `).join('');
}

async function selectDocument(docId) {
    AppState.activeDocId = docId;
    updateSidebarList();

    const doc = AppState.documents.find(d => d.id === docId);

    if (!doc)
        return;

    // Load PDF Viewer
    DOM.pdfEmptyState.classList.add('hidden');
    DOM.pdfCanvas.classList.remove('hidden');
    DOM.pdfControls.classList.remove('hidden');
    DOM.pdfControls.classList.add('flex');

    AppState.pdfDoc = await pdfjsLib.getDocument({ data: doc.arrayBuffer }).promise;
    AppState.pageNum = 1;

    DOM.pdfPageCount.textContent = AppState.pdfDoc.numPages;

    renderPage(AppState.pageNum);

    // Reset UI for other tabs
    DOM.mindmapContainer.innerHTML = '<div class="text-gray-400 text-center">Click Regenerate to analyze paper and build Knowledge Graph.</div>';
    DOM.pptSlidesContainer.innerHTML = '<div class="text-gray-400 text-center">Click Regenerate to analyze paper and build PPT Deck.</div>';
    DOM.pptControls.classList.add('hidden');

    // Add initial bot message
    appendMessage('bot', `I have analyzed **${doc.name}**. I'm ready to answer your questions. I will explicitly cite page numbers based on the uploaded content.`);
}

/** PDF RENDERING LOGIC **/
function renderPage(num) {
    AppState.pdfDoc.getPage(num).then(function (page) {
        const viewport = page.getViewport({ scale: 1.5 });

        DOM.pdfCanvas.height = viewport.height;
        DOM.pdfCanvas.width = viewport.width;

        const renderContext = {
            canvasContext: DOM.pdfCanvas.getContext('2d'),
            viewport: viewport
        };

        page.render(renderContext);
    });

    DOM.pdfPageNum.value = num;
}

// Jump to specific page
// NEW: Jump to specific page on ENTER key
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
    if (AppState.pageNum <= 1)
        return;

    AppState.pageNum--;
    renderPage(AppState.pageNum);
});

DOM.pdfNext.addEventListener('click', () => {
    if (AppState.pageNum >= AppState.pdfDoc.numPages)
        return;

    AppState.pageNum++;
    renderPage(AppState.pageNum);
});

/** FEATURE: KNOWLEDGE GRAPH (MIND MAP) **/
DOM.btnRegenGraph.addEventListener('click', () => renderMindMap(true));

async function renderMindMap(forceRegenerate = false) {
    const doc = AppState.documents.find(d => d.id === AppState.activeDocId);

    if (!doc)
        return alert("Select a document first.");

    if (forceRegenerate || !doc.mindmapCode) {
        showOverlay("Analyzing Medical Concepts...\nDrawing Knowledge Graph...");

        try {
            const res = await fetch(`${AppState.backendUrl}/api/documents/${doc.id}/mindmap`, {
                method: 'POST'
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err);
            }

            const data = await res.json();
            doc.mindmapCode = data.mindmapCode;
        }

        catch (e) {
            alert("Error generating mind map: " + e.message);
            hideOverlay();
            return;
        }

        hideOverlay();
    }

    try {
        DOM.mindmapContainer.innerHTML = `<div class="mermaid">${doc.mindmapCode}</div>`;
        await mermaid.run();

        // Add zoom capability
        const svg = DOM.mindmapContainer.querySelector('svg');
        if (svg) {
            let scale = 1;
            DOM.mindmapContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                scale = scale + e.deltaY * -0.001;
                scale = Math.min(Math.max(.125, scale), 4);
                svg.style.transform = `scale(${scale})`;
                svg.style.transition = 'transform 0.1s';
            });
        }
    }

    catch (e) {
        DOM.mindmapContainer.innerHTML = `<div class="text-red-500">Error rendering graph. Please regenerate.</div>`;
    }
}

/** FEATURE: PPT DECK **/
DOM.btnRegenPpt.addEventListener('click', () => renderPpt(true));

async function renderPpt(forceRegenerate = false) {
    const doc = AppState.documents.find(d => d.id === AppState.activeDocId);

    if (!doc)
        return alert("Select a document first.");

    if (forceRegenerate || !doc.pptData) {
        showOverlay("Distilling key findings...\nGenerating Presentation Deck...");

        try {
            const res = await fetch(`${AppState.backendUrl}/api/documents/${doc.id}/ppt`, {
                method: 'POST'
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err);
            }

            const data = await res.json();
            doc.pptData = data.pptData;
        }

        catch (e) {
            alert("Error generating PPT: " + e.message);
            hideOverlay();
            return;
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
    DOM.pptTotalNum.textContent = AppState.pptSlides.length;
    DOM.pptCurrentNum.textContent = AppState.currentPptSlide + 1;

    const html = AppState.pptSlides.map((slide, index) => {
        const isActive = index === AppState.currentPptSlide;
        return `
        <div class="slide-fade ${isActive ? 'slide-active' : 'slide-hidden'} w-full max-w-2xl bg-white dark:bg-gray-800 p-10 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
        <div class="text-io-accent text-5xl mb-6 flex justify-center">
            <i class="ph-fill ${slide.icon || 'ph-flask'}"></i>
        </div>
        
        <h2 class="text-3xl font-bold mb-6 text-gray-900 dark:text-white">${slide.title}</h2>
        
        <ul class="text-left space-y-4">
        ${slide.bullets.map(b => `
            <li class="flex items-start gap-3 text-lg text-gray-700 dark:text-gray-300">
                <i class="ph-fill ph-check-circle text-io-accent mt-1 shrink-0"></i>
                <span>${b}</span>
            </li>
        `).join('')}
        </ul>
        </div>
        `;
    }).join('');

    DOM.pptSlidesContainer.innerHTML = html;
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


/** CHATBOT LOGIC (AGENTIC Q&A) **/
DOM.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = DOM.chatInput.value.trim();

    if (!query)
        return;

    const doc = AppState.documents.find(d => d.id === AppState.activeDocId);
    if (!doc) {
        alert("Please upload and select a medical document first.");
        return;
    }

    // UI update
    appendMessage('user', query);
    DOM.chatInput.value = '';
    const typingIndicatorId = appendTypingIndicator();

    try {
        const res = await fetch(`${AppState.backendUrl}/api/documents/${doc.id}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: query })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(err);
        }

        const data = await res.json();

        removeMessage(typingIndicatorId);
        appendMessage('bot', data.response);
    }

    catch (error) {
        removeMessage(typingIndicatorId);
        appendMessage('bot', `**Error:** Failed to reach Agent. ${error.message}`);
    }
});

// Chat UI Helpers
function appendMessage(sender, text) {
    const div = document.createElement('div');
    div.className = 'flex gap-2';

    if (sender === 'user') {
        div.innerHTML = `
        <div class="flex-1 bg-io-accent text-white p-3 rounded-lg rounded-tr-none shadow-sm ml-8">
        ${marked.parse(text)}
        </div>
        <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0 text-gray-700 dark:text-gray-300">
            <i class="ph-fill ph-user"></i>
        </div>`;
    }

    else {
        div.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center shrink-0 text-io-accent">
                <i class="ph-fill ph-robot"></i>
            </div>
            <div class="flex-1 bg-white dark:bg-gray-700 p-3 rounded-lg rounded-tl-none shadow-sm text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none">
                ${marked.parse(text)}
            </div>
        `;
    }

    DOM.chatHistory.appendChild(div);
    DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;
}

function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');

    div.id = id;
    div.className = 'flex gap-2 text-gray-500 text-sm italic items-center';
    div.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center shrink-0 text-io-accent opacity-50">
            <i class="ph-fill ph-robot"></i>
        </div>
        Agent is processing...
    `;

    DOM.chatHistory.appendChild(div);
    DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;

    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el)
        el.remove();
}

// Enter to submit chat
DOM.chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        DOM.chatForm.dispatchEvent(new Event('submit'));
    }
});
