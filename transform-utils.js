function formatXMLString(xml) {
    let formatted = '';
    let indent = 0;
    xml = xml.replace(/<\?xml[^?]*\?>\s*/g, '');
    xml.split(/>\s*</).forEach(node => {
        if (node.match(/^\/\w/)) indent--;
        formatted += '  '.repeat(indent) + '<' + node + '>\n';
        if (node.match(/^<?\w[^>]*[^\/]$/)) indent++;
    });
    return formatted.substring(1, formatted.length - 2);
}

function formatYAML(yaml) {
    const lines = yaml.split('\n');
    let formatted = '';
    
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            formatted += line + '\n';
            return;
        }
        
        const leadingSpaces = line.match(/^\s*/)[0].length;
        const indent = Math.floor(leadingSpaces / 2);
        formatted += '  '.repeat(indent) + trimmed + '\n';
    });
    
    return formatted.trim();
}

function detectType(content) {
    const trimmed = content.trim();
    if (trimmed.startsWith('<') || trimmed.startsWith('<?xml')) return 'xml';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    return 'yaml';
}
