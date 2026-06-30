// Decoded history management (IndexedDB)
let historyDb;
let historyCache = [];
let selectedHistoryId = null;

function openHistoryDb() {
    return new Promise((resolve, reject) => {
        if (historyDb) return resolve(historyDb);
        const req = indexedDB.open('xmlDecoderHistory', 2);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (db.objectStoreNames.contains('entries')) db.deleteObjectStore('entries');
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id', autoIncrement: true });
            if (!db.objectStoreNames.contains('content')) db.createObjectStore('content', { keyPath: 'id' });
        };
        req.onsuccess = e => { historyDb = e.target.result; resolve(historyDb); };
        req.onerror = e => reject(e);
    });
}

async function getHistoryMeta() {
    const db = await openHistoryDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readonly');
        const req = tx.objectStore('meta').getAll();
        req.onsuccess = () => resolve(req.result.reverse());
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
    });
}

async function getHistoryContent(id) {
    const db = await openHistoryDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('content', 'readonly');
        const req = tx.objectStore('content').get(id);
        req.onsuccess = () => resolve(req.result?.input || '');
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
    });
}

async function saveToHistory(inputXml) {
    const metas = await getHistoryMeta();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(inputXml, 'text/xml');
    const messageId = xmlDoc.querySelector('MessageId')?.textContent || '';
    if (messageId && metas.some(e => e.messageId === messageId)) return;
    if (!messageId && metas.some(e => !e.messageId)) return;
    const environment = xmlDoc.querySelector('Environment')?.textContent || '';
    const msgService = (xmlDoc.querySelector('MessageService')?.textContent || '').split(' ').map(w => w[0]).join('');
    const jurisdiction = xmlDoc.querySelector('LodgementVerificationRequest > Jurisdiction')?.textContent || '';
    const workspaceId = xmlDoc.querySelector('ElnWorkspaceId')?.textContent || '';
    const caseId = xmlDoc.querySelector('ElnLodgementCaseId')?.textContent || '';
    const label = [environment, msgService, jurisdiction, workspaceId, caseId, new Date().toLocaleString('en-AU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })].filter(Boolean).join(' - ');

    const db = await openHistoryDb();
    const tx = db.transaction(['meta', 'content'], 'readwrite');
    const metaStore = tx.objectStore('meta');
    const addReq = metaStore.add({ label, messageId });
    addReq.onsuccess = () => {
        tx.objectStore('content').put({ id: addReq.result, input: inputXml });
    };
    tx.oncomplete = () => refreshHistoryDropdown();
}

async function refreshHistoryDropdown() {
    const metas = await getHistoryMeta();
    const section = document.getElementById('history-section');
    const input = document.getElementById('history-input');
    input.placeholder = '-- Decoded History (' + metas.length + ') --';
    section.style.display = metas.length ? 'flex' : 'none';
}

async function showHistoryList() {
    historyCache = await getHistoryMeta();
    const query = document.getElementById('history-input').value.toLowerCase();
    const filtered = query ? historyCache.filter(e => e.label.toLowerCase().includes(query)) : historyCache;
    renderHistoryList(filtered);
}

function filterHistory() {
    const query = document.getElementById('history-input').value.toLowerCase();
    if (!historyCache.length) { showHistoryList(); return; }
    const filtered = historyCache.filter(e => e.label.toLowerCase().includes(query));
    renderHistoryList(filtered);
}

function renderHistoryList(entries) {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    entries.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.textContent = entry.label;
        div.onclick = async () => {
            const xml = await getHistoryContent(entry.id);
            inputEditor.setValue(xml);
            clearOutput();
            list.style.display = 'none';
            selectedHistoryId = entry.id;
            const input = document.getElementById('history-input');
            input.value = entry.label;
            positionHistoryButtons();
        };
        list.appendChild(div);
    });
    list.style.display = entries.length ? 'block' : 'none';
}

function positionHistoryButtons() {
    document.getElementById('history-clear').style.display = 'block';
    document.getElementById('history-save-label').style.display = 'block';
    document.getElementById('history-delete').style.display = 'block';
}

function clearHistoryInput() {
    document.getElementById('history-input').value = '';
    document.getElementById('history-clear').style.display = 'none';
    document.getElementById('history-save-label').style.display = 'none';
    document.getElementById('history-delete').style.display = 'none';
    selectedHistoryId = null;
}

async function saveHistoryLabel() {
    if (selectedHistoryId === null) return;
    const newLabel = document.getElementById('history-input').value.trim();
    if (!newLabel) return;
    const db = await openHistoryDb();
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    const req = store.get(selectedHistoryId);
    req.onsuccess = () => {
        const entry = req.result;
        entry.label = newLabel;
        store.put(entry);
    };
    tx.oncomplete = () => {
        historyCache = [];
        refreshHistoryDropdown();
        const input = document.getElementById('history-input');
        input.style.borderColor = '#28a745';
        setTimeout(() => input.style.borderColor = '', 1000);
    };
}

async function deleteHistoryEntry() {
    if (selectedHistoryId === null) return;
    const db = await openHistoryDb();
    const tx = db.transaction(['meta', 'content'], 'readwrite');
    tx.objectStore('meta').delete(selectedHistoryId);
    tx.objectStore('content').delete(selectedHistoryId);
    tx.oncomplete = () => {
        clearHistoryInput();
        historyCache = [];
        refreshHistoryDropdown();
    };
}

async function clearHistory() {
    if (!confirm('Clear all decoded history?')) return;
    const db = await openHistoryDb();
    const tx = db.transaction(['meta', 'content'], 'readwrite');
    tx.objectStore('meta').clear();
    tx.objectStore('content').clear();
    tx.oncomplete = () => refreshHistoryDropdown();
}

// Event listeners for history
document.addEventListener('click', e => {
    if (!e.target.closest('.history-section')) {
        document.getElementById('history-list').style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    refreshHistoryDropdown();

    document.getElementById('history-input').addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            clearHistoryInput();
            showHistoryList();
        }
        if (e.key === 'Enter' && selectedHistoryId !== null) {
            e.preventDefault();
            saveHistoryLabel();
        }
    });
});
