let inputEditor, outputEditor, formatterEditor, diffOriginalEditor, diffModifiedEditor, diffEditor;
let isDark = localStorage.getItem('theme') === 'dark';

const editorDefaults = {
    value: '',
    theme: isDark ? 'vs-dark' : 'vs',
    automaticLayout: true,
    minimap: { enabled: true },
    folding: true,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on'
};

if (isDark) {
    document.body.classList.add('dark');
    document.querySelector('.theme-toggle').textContent = '☀️';
}

require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});

require(['vs/editor/editor.main'], function() {
    initDecoderTab();
    initFormatterTab();
    initDiffTab();
});

function initFormatterTab() {
    formatterEditor = monaco.editor.create(document.getElementById('formatter-editor'), {
        ...editorDefaults,
        language: 'plaintext',
        formatOnPaste: true,
        formatOnType: true
    });

    const savedFormatter = localStorage.getItem('formatterContent');
    if (savedFormatter) formatterEditor.setValue(savedFormatter);

    formatterEditor.onDidChangeModelContent(() => {
        const content = formatterEditor.getValue();
        if (content.trim()) {
            monaco.editor.setModelLanguage(formatterEditor.getModel(), detectType(content));
        }
        localStorage.setItem('formatterContent', content);
    });
}

function initDiffTab() {
    diffOriginalEditor = monaco.editor.createModel('', 'xml');
    diffModifiedEditor = monaco.editor.createModel('', 'xml');

    diffEditor = monaco.editor.createDiffEditor(document.getElementById('diff-editor-container'), {
        theme: isDark ? 'vs-dark' : 'vs',
        automaticLayout: true,
        renderSideBySide: true,
        scrollBeyondLastLine: false,
        originalEditable: true
    });
    diffEditor.setModel({ original: diffOriginalEditor, modified: diffModifiedEditor });

    const savedDiffOriginal = localStorage.getItem('diffOriginalContent');
    const savedDiffModified = localStorage.getItem('diffModifiedContent');
    if (savedDiffOriginal) diffOriginalEditor.setValue(savedDiffOriginal);
    if (savedDiffModified) diffModifiedEditor.setValue(savedDiffModified);

    diffOriginalEditor.onDidChangeContent(() => localStorage.setItem('diffOriginalContent', diffOriginalEditor.getValue()));
    diffModifiedEditor.onDidChangeContent(() => localStorage.setItem('diffModifiedContent', diffModifiedEditor.getValue()));
}
async function loadDiffFile(side) {
    const content = await loadWithFilePicker();
    if (content) {
        if (side === 'original') diffOriginalEditor.setValue(content);
        else diffModifiedEditor.setValue(content);
    }
}

function toggleTheme() {
    isDark = !isDark;
    document.body.classList.toggle('dark', isDark);
    inputEditor.updateOptions({ theme: isDark ? 'vs-dark' : 'vs' });
    outputEditor.updateOptions({ theme: isDark ? 'vs-dark' : 'vs' });
    formatterEditor.updateOptions({ theme: isDark ? 'vs-dark' : 'vs' });
    diffEditor.updateOptions({ theme: isDark ? 'vs-dark' : 'vs' });
    document.querySelector('.theme-toggle').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function switchTab(tab) {
    document.querySelectorAll('.menu-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('menu-' + tab).classList.add('active');
    document.getElementById(tab + '-tab').classList.add('active');
}

function formatCode() {
    const input = formatterEditor.getValue();
    if (!input.trim()) return;

    const type = detectType(input);
    monaco.editor.setModelLanguage(formatterEditor.getModel(), type);

    try {
        let formatted;
        if (type === 'xml') {
            formatted = formatXMLString(input);
        } else if (type === 'json') {
            formatted = JSON.stringify(JSON.parse(input), null, 2);
        } else {
            formatted = formatYAML(input);
        }
        formatterEditor.setValue(formatted);
        formatterEditor.setPosition({ lineNumber: 1, column: 1 });
    } catch (e) {
        alert('Error formatting: ' + e.message);
    }
}

function clearFormatter() {
    formatterEditor.setValue('');
    monaco.editor.setModelLanguage(formatterEditor.getModel(), 'plaintext');
}

function swapDiffEditors() {
    const orig = diffOriginalEditor.getValue();
    const mod = diffModifiedEditor.getValue();
    diffOriginalEditor.setValue(mod);
    diffModifiedEditor.setValue(orig);
}

function formatDiff() {
    const orig = diffOriginalEditor.getValue();
    const mod = diffModifiedEditor.getValue();
    if (orig.trim()) diffOriginalEditor.setValue(formatXMLString(orig));
    if (mod.trim()) diffModifiedEditor.setValue(formatXMLString(mod));
}

function clearDiff() {
    diffOriginalEditor.setValue('');
    diffModifiedEditor.setValue('');
}
