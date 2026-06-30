let decodedCounterparts = [];
let lodgementDocs = [];
let fullXml = '';

function initDecoderTab() {
    inputEditor = monaco.editor.create(document.getElementById('input-editor'), { ...editorDefaults, language: 'xml' });
    outputEditor = monaco.editor.create(document.getElementById('output-editor'), { ...editorDefaults, language: 'xml' });

    const savedInput = localStorage.getItem('inputContent');
    if (savedInput) inputEditor.setValue(savedInput);

    inputEditor.onDidChangeModelContent(() => {
        localStorage.setItem('inputContent', inputEditor.getValue());
    });

    inputEditor.onDidPaste(() => {
        setTimeout(() => {
            const value = inputEditor.getValue().trimEnd();
            inputEditor.setValue(value);
            inputEditor.setPosition({ lineNumber: 1, column: 1 });
            clearOutput();
            displayFormattedXml();
        }, 0);
    });

    const inputContainer = document.getElementById('input-editor');
    inputContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    inputContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.xml')) {
            const content = await files[0].text();
            inputEditor.setValue(content);
            clearOutput();
            displayFormattedXml();
        }
    });
}

function clearOutput() {
    document.getElementById('counterpart-buttons').innerHTML = '';
    document.getElementById('counterpart-buttons').style.display = 'none';
    document.getElementById('sub-buttons').innerHTML = '';
    document.getElementById('sub-buttons-container').style.display = 'none';
    document.getElementById('output-title').textContent = '';
    document.getElementById('output-actions').style.display = 'none';
    document.getElementById('output-editor').style.display = 'none';
    document.getElementById('output-label').style.display = 'none';
    document.getElementById('exclusion-options').style.display = 'none';
    decodedCounterparts = [];
    lodgementDocs = [];
    fullXml = '';
}

function showOutput(title, xml) {
    outputEditor.setValue(formatXMLString(xml));
    document.getElementById('output-title').textContent = title;
    document.getElementById('output-actions').style.display = 'flex';
    document.getElementById('output-editor').style.display = 'block';
    document.getElementById('output-label').style.display = 'block';
}

function displayFormattedXml() {
    const input = inputEditor.getValue();
    if (!input.trim()) return;
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(input, 'text/xml');
        const serializer = new XMLSerializer();
        const formatted = serializer.serializeToString(xmlDoc);
        showOutput('Formatted XML', formatted);
    } catch (e) {
        outputEditor.setValue('Error formatting XML: ' + e.message);
    }
}

function decodeBase64() {
    const input = inputEditor.getValue();
    decodedCounterparts = [];
    lodgementDocs = [];
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(input, 'text/xml');
        
        const counterpartNodes = xmlDoc.querySelectorAll('Counterpart, [*|Counterpart]');
        const tempData = [];
        
        for (let node of counterpartNodes) {
            if (node.textContent.trim()) {
                try {
                    let decoded, decodedDoc, metaRoot;
                    const contentNode = node.querySelector('CounterpartContent');
                    let alreadyDecoded = false;
                    if (contentNode && contentNode.children.length > 0) {
                        const serializer = new XMLSerializer();
                        decoded = serializer.serializeToString(contentNode.children[0]);
                        decodedDoc = parser.parseFromString(decoded, 'text/xml');
                        metaRoot = node;
                        alreadyDecoded = true;
                    } else {
                        decoded = atob(node.textContent.trim());
                        decodedDoc = parser.parseFromString(decoded, 'text/xml');
                        metaRoot = decodedDoc;
                    }
                    const docType = metaRoot.querySelector('DocumentType')?.textContent || 'Unknown';
                    const signingRole = metaRoot.querySelector('SigningPartyRole')?.textContent;
                    const elnDocId = metaRoot.querySelector('ElnDocumentId')?.textContent;

                    // Find the parent Lodgement Document or Lodgement Instructions element
                    let lodgementDocNode = node.parentElement;
                    while (lodgementDocNode &&
                           !lodgementDocNode.tagName.includes('LodgementDocument') &&
                           !lodgementDocNode.tagName.includes('LodgementInstructions')) {
                        lodgementDocNode = lodgementDocNode.parentElement;
                    }

                    tempData.push({ docType, signingRole, decoded, node, decodedDoc, elnDocId, lodgementDocNode, alreadyDecoded });
                } catch (e) {}
            }
        }
        
        // Group by ElnDocumentId and DocumentType
        const lodgementGroups = {};
        tempData.forEach(d => {
            const key = `${d.docType}_${d.elnDocId}`;
            if (!lodgementGroups[key]) {
                lodgementGroups[key] = {
                    docType: d.docType,
                    elnDocId: d.elnDocId,
                    lodgementDocNode: d.lodgementDocNode,
                    counterparts: []
                };
            }
            lodgementGroups[key].counterparts.push(d);
        });

        // Assign numbers to each lodgement document
        const docTypeCounters = {};
        const docTypeTotals = {};

        // First pass: count total of each document type
        Object.values(lodgementGroups).forEach(group => {
            docTypeTotals[group.docType] = (docTypeTotals[group.docType] || 0) + 1;
        });

        // Second pass: assign labels with numbers only if multiple of same type
        Object.values(lodgementGroups).forEach(group => {
            docTypeCounters[group.docType] = (docTypeCounters[group.docType] || 0) + 1;
            const number = docTypeCounters[group.docType];
            const label = docTypeTotals[group.docType] > 1 ? `${group.docType} ${number}` : group.docType;

            // Clone the lodgement document node and decode all counterparts within it
            let lodgementXml = '';
            if (group.lodgementDocNode) {
                const clonedLodgement = group.lodgementDocNode.cloneNode(true);
                const clonedCounterparts = clonedLodgement.querySelectorAll('Counterpart, [*|Counterpart]');

                // Decode all counterparts in the cloned lodgement document (skip already decoded)
                group.counterparts.forEach((cp, idx) => {
                    if (cp.alreadyDecoded) return;
                    if (clonedCounterparts[idx]) {
                        clonedCounterparts[idx].textContent = '';
                        while (clonedCounterparts[idx].firstChild) {
                            clonedCounterparts[idx].removeChild(clonedCounterparts[idx].firstChild);
                        }
                        for (let child of cp.decodedDoc.documentElement.childNodes) {
                            clonedCounterparts[idx].appendChild(clonedLodgement.ownerDocument.importNode(child, true));
                        }
                    }
                });

                const serializer = new XMLSerializer();
                lodgementXml = serializer.serializeToString(clonedLodgement);
            }

            lodgementDocs.push({
                label: label,
                fullXml: lodgementXml,
                counterparts: group.counterparts.map(cp => ({
                    role: cp.signingRole || group.docType,
                    xml: cp.decoded
                }))
            });

            // Still process nodes for full XML (skip already decoded)
            group.counterparts.forEach(d => {
                if (d.alreadyDecoded) return;
                d.node.textContent = '';
                while (d.node.firstChild) d.node.removeChild(d.node.firstChild);
                for (let child of d.decodedDoc.documentElement.childNodes) {
                    d.node.appendChild(xmlDoc.importNode(child, true));
                }
            });
        });

        const serializer = new XMLSerializer();
        fullXml = serializer.serializeToString(xmlDoc);
        displayButtons();
        saveToHistory(input);
        
        setTimeout(() => {
            const fullBtn = document.getElementById('btn-full');
            if (fullBtn) {
                fullBtn.click();
            }
        }, 50);
    } catch (e) {
        outputEditor.setValue('Error processing XML: ' + e.message);
        document.getElementById('output-editor').style.display = 'block';
        document.getElementById('output-label').style.display = 'block';
    }
}

function displayButtons() {
    const container = document.getElementById('counterpart-buttons');
    container.innerHTML = '';
    container.style.display = 'block';

    const fullBtn = document.createElement('button');
    fullBtn.className = 'counterpart-btn';
    fullBtn.id = 'btn-full';
    fullBtn.textContent = 'Full XML';
    fullBtn.onclick = () => {
        setActive('btn-full');
        const output = getOutputXML(fullXml);
        showOutput('Full XML', output);
        document.getElementById('sub-buttons').innerHTML = '';
        document.getElementById('sub-buttons-container').style.display = 'none';
        document.getElementById('exclusion-options').style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    container.appendChild(fullBtn);
    
    lodgementDocs.forEach((doc, idx) => {
        const btn = document.createElement('button');
        btn.className = 'counterpart-btn';
        btn.id = 'btn-lodgement-' + idx;
        btn.textContent = doc.label;
        btn.onclick = () => showLodgementDoc(idx);
        container.appendChild(btn);
    });
}

function showLodgementDoc(lodgementIdx) {
    setActive('btn-lodgement-' + lodgementIdx);
    const doc = lodgementDocs[lodgementIdx];

    // Show the full lodgement document
    const output = getOutputXML(doc.fullXml);
    showOutput(doc.label, output);

    // Display sub-buttons for complete document and individual counterparts
    const subContainer = document.getElementById('sub-buttons');
    subContainer.innerHTML = '';
    document.getElementById('sub-buttons-container').style.display = 'block';
    document.getElementById('exclusion-options').style.display = 'block';

    // Add "Complete" button
    const completeBtn = document.createElement('button');
    completeBtn.className = 'counterpart-btn active';
    completeBtn.id = 'btn-sub-' + lodgementIdx + '-complete';
    completeBtn.textContent = 'Full Lodgement Document';
    completeBtn.onclick = () => showSubCounterpart(lodgementIdx, -1);
    subContainer.appendChild(completeBtn);

    // Add individual counterpart buttons
    doc.counterparts.forEach((cp, cpIdx) => {
        const subBtn = document.createElement('button');
        subBtn.className = 'counterpart-btn';
        subBtn.id = 'btn-sub-' + lodgementIdx + '-' + cpIdx;
        subBtn.textContent = 'Counterpart - ' + cp.role;
        subBtn.onclick = () => showSubCounterpart(lodgementIdx, cpIdx);
        subContainer.appendChild(subBtn);
    });

    document.getElementById('counterpart-buttons').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showSubCounterpart(lodgementIdx, cpIdx) {
    const doc = lodgementDocs[lodgementIdx];

    // Update active state for sub-buttons
    document.querySelectorAll('#sub-buttons .counterpart-btn').forEach(b => b.classList.remove('active'));

    if (cpIdx === -1) {
        // Show complete document
        document.getElementById('btn-sub-' + lodgementIdx + '-complete')?.classList.add('active');
        document.getElementById('output-title').textContent = doc.label;
        const output = getOutputXML(doc.fullXml);
        outputEditor.setValue(formatXMLString(output));
    } else {
        // Show individual counterpart
        const cp = doc.counterparts[cpIdx];
        document.getElementById('btn-sub-' + lodgementIdx + '-' + cpIdx)?.classList.add('active');
        document.getElementById('output-title').textContent = `${doc.label} - ${cp.role}`;
        const output = getOutputXML(cp.xml);
        outputEditor.setValue(formatXMLString(output));
    }
}

function setActive(btnId) {
    document.querySelectorAll('.counterpart-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(btnId).classList.add('active');
}

function excludeElements(xmlString, elementConfigs) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    elementConfigs.forEach(config => {
        const elements = xmlDoc.querySelectorAll(`${config.name}, [*|${config.name}]`);
        elements.forEach(elem => {
            // Clear all child nodes
            while (elem.firstChild) {
                elem.removeChild(elem.firstChild);
            }
            // Add exclusion message as text content
            elem.textContent = config.message || `[${config.name} excluded]`;
        });
    });
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(xmlDoc);
}

function getOutputXML(xmlString) {
    const excludeSignature = document.getElementById('excludeSignature').checked;
    const excludeRenderedData = document.getElementById('excludeRenderedData').checked;
    
    let output = xmlString;
    
    if (excludeSignature) {
        output = excludeElements(output, [
            { name: 'Signature', message: '[Signature excluded]' },
            { name: 'DigitalSigningReport', message: '[DigitalSigningReport excluded]' }
        ]);
    }
    
    if (excludeRenderedData) {
        output = excludeElements(output, [
            { name: 'RenderedData', message: '[RenderedData excluded]' }
        ]);
    }
    
    return output;
}

// Add event listener to refresh output when checkbox changes
document.addEventListener('DOMContentLoaded', function() {
    const signatureCheckbox = document.getElementById('excludeSignature');
    const renderedDataCheckbox = document.getElementById('excludeRenderedData');
    
    const refreshOutput = function() {
        // Re-display the current output with the new setting
        const activeBtn = document.querySelector('.counterpart-btn.active');
        if (activeBtn) {
            activeBtn.click();
        }
    };
    
    if (signatureCheckbox) {
        signatureCheckbox.addEventListener('change', refreshOutput);
    }
    
    if (renderedDataCheckbox) {
        renderedDataCheckbox.addEventListener('change', refreshOutput);
    }
});

function copyToClipboard(btn) {
    copyText(btn, outputEditor.getValue());
}

function saveCounterpart() {
    const content = outputEditor.getValue();
    const title = document.getElementById('output-title').textContent;

    saveFile(content, title);
}

function clearAll() {
    inputEditor.setValue('');
    outputEditor.setValue('');
    clearOutput();
    clearHistoryInput();
}

document.addEventListener('DOMContentLoaded', function() {
    const signatureCheckbox = document.getElementById('excludeSignature');
    const renderedDataCheckbox = document.getElementById('excludeRenderedData');
    
    const refreshOutput = function() {
        // Re-display the current output with the new setting
        const activeBtn = document.querySelector('.counterpart-btn.active');
        if (activeBtn) {
            activeBtn.click();
        }
    };
    
    if (signatureCheckbox) {
        signatureCheckbox.addEventListener('change', refreshOutput);
    }
    
    if (renderedDataCheckbox) {
        renderedDataCheckbox.addEventListener('change', refreshOutput);
    }
});

function saveXML() {
    saveFile(inputEditor.getValue(), 'xml');
}

async function loadXML() {
    const content = await loadWithFilePicker();
    if (content) {
        inputEditor.setValue(content);
        clearOutput();
        displayFormattedXml();
    }
}
