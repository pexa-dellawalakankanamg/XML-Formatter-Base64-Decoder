async function loadWithFilePicker() {
    if (!('showOpenFilePicker' in window)) {
        alert('File System Access API not supported in this browser');
        return null;
    }

    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'XML Files',
                accept: { 'text/xml': ['.xml'] }
            }],
            multiple: false
        });
        const file = await handle.getFile();
        return await file.text();
    } catch (e) {
        if (e.name !== 'AbortError') {
            alert('Error loading file: ' + e.message);
        }
        return null;
    }
}

async function saveFile(content, prefix) {
    if (!content.trim()) {
        alert('No content to save');
        return;
    }

    if (!('showSaveFilePicker' in window)) {
        alert('File System Access API not supported in this browser');
        return;
    }

    try {
        const filename = prefix.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const handle = await window.showSaveFilePicker({
            suggestedName: `${filename}-${Date.now()}.xml`,
            types: [{
                description: 'XML Files',
                accept: { 'text/xml': ['.xml'] }
            }]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        alert('XML saved successfully');
    } catch (e) {
        if (e.name !== 'AbortError') {
            alert('Error saving file: ' + e.message);
        }
    }
}

function copyText(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = originalText, 2000);
    }).catch(e => alert('Failed to copy: ' + e.message));
}
