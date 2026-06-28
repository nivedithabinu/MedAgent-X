/** APPLICATION STATE **/
const AppState = {
    backendUrl: 'https://medagent-x.onrender.com',
    documents: [], 
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

    pdfCanvas: document.getElementById('pdf-canvas'),
    pdfControls: document.getElementById('pdf-controls'),
    pdfEmptyState: document.getElementById('pdf-empty-state'),
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

    chatHistory: document.getElementById('chat-history'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),

    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text')
};

/** INITIALIZATION & THEME **/
try {
    mermaid.initialize({ startOnLoad: false, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' });
} catch (e) { console.warn("Mermaid init failed", e); }

DOM.btnTheme.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    try { mermaid.initialize({ theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' }); } catch (e) {}
    if (AppState.activeDocId) 
        renderMindMap(false);
});

// Fullscreen & Tabs
document.querySelectorAll('.btn-fullscreen').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = e.target.closest('button').dataset.target;
        const container = document.getElementById(targetId);
        
        container.classList.toggle('fullscreen-mode');
        
        const icon = e.target.closest('button').querySelector('i');
        icon.classList.toggle('ph-corners-out');
        icon.classList.toggle('ph-corners-in');
    });
});

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
            content.classList.toggle('hidden', content.id !== targetId);
            content.classList.toggle('flex', content.id === targetId);
        });

        if (targetId === 'view-graph' && AppState.activeDocId) 
            renderMindMap(false);
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
            
            if (statusText) 
                statusText.textContent = "Backend Connected";
        }
        
    } 
    
    catch (e) {
        if (DOM.apiStatusIndicator) {
            DOM.apiStatusIndicator.classList.replace('bg-green-500', 'bg-red-500');
            DOM.apiStatusIndicator.classList.remove('shadow-[0_0_8px_#22c55e]');
            if (statusText) statusText.textContent = "Backend Disconnected";
        }
    }
}

checkBackendConnection();

/** DOCUMENT UPLOAD & PARSING **/
DOM.fileUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showOverlay("Uploading to Server...\nVerifying Medical Content...");

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${AppState.backendUrl}/api/upload`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errorText = await res.json().catch(() => ({detail: "Server connection failed."}));
            throw new Error(errorText.detail || "Failed to upload document");
        }

        const data = await res.json();
        const arrayBuffer = await file.arrayBuffer();

        AppState.documents.push({
            id: crypto.randomUUID(),
            name: file.name,
            file: file,
            arrayBuffer: arrayBuffer,
            pages: data.pages,
            mindmapCode: null,
            pptData: null
        });

        updateSidebarList();
        selectDocument(AppState.documents[AppState.documents.length - 1].id);
    } 
    
    catch (err) {
        alert(`Failed to upload ${file.name}: ${err.message}`);
    } 
    
    finally {
        hideOverlay();
        e.target.value = ''; // Reset input
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

    DOM.pdfEmptyState.classList.add('hidden');
    DOM.pdfCanvas.classList.remove('hidden');
    DOM.pdfControls.classList.remove('hidden');
    DOM.pdfControls.classList.add('flex');

    AppState.pdfDoc = await pdfjsLib.getDocument({ data: doc.arrayBuffer }).promise;
    AppState.pageNum = 1;
    DOM.pdfPageCount.textContent = AppState.pdfDoc.numPages;
    renderPage(AppState.pageNum);

    DOM.mindmapContainer.innerHTML = '<div class="text-gray-400 text-center">Click Regenerate to analyze paper and build Knowledge Graph.</div>';
    DOM.pptSlidesContainer.innerHTML = '<div class="text-gray-400 text-center">Click Regenerate to analyze paper and build PPT Deck.</div>';
    DOM.pptControls.classList.add('hidden');

    DOM.chatHistory.innerHTML = ''; // Clear chat history
    appendMessage('bot', `I have analyzed **${doc.name}**. I'm ready to answer your questions. I will explicitly cite page numbers based on the uploaded content.`);
}

function renderPage(num) {
    AppState.pdfDoc.getPage(num).then(function (page) {
        const viewport = page.getViewport({ scale: 1.5 });
        
        DOM.pdfCanvas.height = viewport.height;
        DOM.pdfCanvas.width = viewport.width;
        
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

DOM.pdfPrev.addEventListener('click', () => { if (AppState.pageNum > 1) { AppState.pageNum--; renderPage(AppState.pageNum); }});
DOM.pdfNext.addEventListener('click', () => { if (AppState.pageNum < AppState.pdfDoc.numPages) { AppState.pageNum++; renderPage(AppState.pageNum); }});

/** API CALL HELPER **/
async function callBackend(endpoint, payload) {
    try {
        const res = await fetch(`${AppState.backendUrl}/api/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const err = await res.json().catch(() => ({detail: "Server Error or Timeout"}));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }
        
        return await res.json();
    } 
    
    catch (e) {
        if (e.message === "Failed to fetch") 
            throw new Error("Connection dropped. The server might be sleeping or analyzing a very large file. Try again.");
        throw e;
    }
}

/** FEATURE: KNOWLEDGE GRAPH **/
DOM.btnRegenGraph.addEventListener('click', () => renderMindMap(true));
async function renderMindMap(forceRegenerate = false) {
    const doc = AppState.documents.find(d => d.id === AppState.activeDocId);
    if (!doc) 
        return alert("Select a document first.");

    if (forceRegenerate || !doc.mindmapCode) {
        showOverlay("Analyzing Medical Concepts...\nDrawing Knowledge Graph...");
        try {
            const context = doc.pages.map(page => `[Page ${page.page}]\n${page.text}`).join("\n\n");
            const data = await callBackend('generate-graph', { context });
            doc.mindmapCode = data.mermaid_code;
        } 
        
        catch (e) {
            alert("Error generating mind map: " + e.message);
            hideOverlay(); return;
        }

        hideOverlay();
    }

    try {
        DOM.mindmapContainer.innerHTML = `<div class="mermaid">${doc.mindmapCode}</div>`;
        await mermaid.run();
        
        const svg = DOM.mindmapContainer.querySelector('svg');
        if (svg) {
            let scale = 1;
            
            DOM.mindmapContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                scale += e.deltaY * -0.001;
                scale = Math.min(Math.max(0.2, scale), 4);
                svg.style.transform = `scale(${scale})`;
                svg.style.transition = 'transform 0.1s';
            });
        }
    } 
    
    catch (e) {
        DOM.mindmapContainer.innerHTML = `<div class="text-red-500 p-4"><h3>Mind Map Render Failed</h3><pre>${doc.mindmapCode}</pre></div>`;
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
            const context = doc.pages.map(page => `[Page ${page.page}]\n${page.text}`).join("\n\n");
            const data = await callBackend('generate-ppt', { context });
            doc.pptData = data.slides;
        } 
        
        catch (e) {
            alert("Error generating PPT: " + e.message);
            hideOverlay(); return;
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
            <div class="text-io-accent text-5xl mb-6 flex justify-center"><i class="ph-fill ${slide.icon || 'ph-flask'}"></i></div>
            <h2 class="text-3xl font-bold mb-6 text-gray-900 dark:text-white">${slide.title}</h2>
            <ul class="text-left space-y-4">
            ${slide.bullets.map(b => `
                <li class="flex items-start gap-3 text-lg text-gray-700 dark:text-gray-300">
                    <i class="ph-fill ph-check-circle text-io-accent mt-1 shrink-0"></i><span>${b}</span>
                </li>
            `).join('')}
            </ul>
        </div>
        `;
    }).join('');

    DOM.pptSlidesContainer.innerHTML = html;
}

DOM.pptPrev.addEventListener('click', () => { if (AppState.currentPptSlide > 0) { AppState.currentPptSlide--; updatePptView(); }});
DOM.pptNext.addEventListener('click', () => { if (AppState.currentPptSlide < AppState.pptSlides.length - 1) { AppState.currentPptSlide++; updatePptView(); }});

/** CHATBOT LOGIC **/
DOM.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = DOM.chatInput.value.trim();
    if (!query) 
        return;

    const doc = AppState.documents.find(d => d.id === AppState.activeDocId);
    
    if (!doc) 
        return alert("Please upload and select a medical document first.");

    appendMessage('user', query);
    DOM.chatInput.value = '';
    const typingIndicatorId = appendTypingIndicator();

    try {
        const context = doc.pages.map(page => `[Page ${page.page}]\n${page.text}`).join("\n\n");
        const data = await callBackend('chat', { query, context });
        removeMessage(typingIndicatorId);
        appendMessage('bot', data.reply);
    } 
    
    catch (error) {
        removeMessage(typingIndicatorId);
        appendMessage('bot', `**Error:** Failed to reach Agent. ${error.message}`);
    }
});

function appendMessage(sender, text) {
    const div = document.createElement('div');
    div.className = 'flex gap-2';
    if (sender === 'user') {
        div.innerHTML = `
        <div class="flex-1 bg-io-accent text-white p-3 rounded-lg rounded-tr-none shadow-sm ml-8">${marked.parse(text)}</div>
        <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0 text-gray-700 dark:text-gray-300"><i class="ph-fill ph-user"></i></div>`;
    } 
    
    else {
        div.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center shrink-0 text-io-accent"><i class="ph-fill ph-robot"></i></div>
        <div class="flex-1 bg-white dark:bg-gray-700 p-3 rounded-lg rounded-tl-none shadow-sm text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none">${marked.parse(text)}</div>`;
    }
    
    DOM.chatHistory.appendChild(div);
    DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;
}

function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    
    div.id = id; div.className = 'flex gap-2 text-gray-500 text-sm italic items-center';
    div.innerHTML = `<div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center shrink-0 text-io-accent opacity-50"><i class="ph-fill ph-robot"></i></div>Agent is processing...`;
    
    DOM.chatHistory.appendChild(div); DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;
    
    return id;
}

function removeMessage(id) { 
    const el = document.getElementById(id); if (el) el.remove(); 
}

DOM.chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); DOM.chatForm.dispatchEvent(new Event('submit')); }});
