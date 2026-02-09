/**
 * Cloudflare Worker: Streaming iCal Parser
 * V4.2: Fixed Apple Calendar Address Accessibility (Escaping & Formatting).
 */

// --- Constants & Config --- //

const CAMPUS_DATA = {
    'CUBE': {
        name: 'CUBE',
        address: 'Sonnenallee 221A, 12059 Berlin',
        coords: '52.475147,13.468200',
        plusCode: 'GCR9+7H7',
        notes: ''
    },
    'A': { name: 'SHED', address: 'Sonnenallee 221C, 12059 Berlin', coords: '52.4758038,13.4549394', plusCode: 'GCC5+QW', notes: '' },
    'B': { name: 'SHED', address: 'Sonnenallee 221C, 12059 Berlin', coords: '52.4758038,13.4549394', plusCode: 'GCC5+QW', notes: '' },
    'C': { name: 'SHED', address: 'Sonnenallee 221D, 12059 Berlin', coords: '52.4760266,13.4549741', plusCode: 'GCC5+RX', notes: '' },
    'D': { name: 'SHED', address: 'Sonnenallee 221E, 12059 Berlin', coords: '52.4762398,13.4550747', plusCode: 'GCC6+22', notes: '' },
    'SON223': {
        name: 'Sonnenallee 223',
        address: 'Sonnenallee 223, 12059 Berlin',
        coords: '52.47446,13.455246',
        plusCode: 'GCC5+GG'
    },
    'SON224A': {
        name: 'Sonnenallee 224a',
        address: 'Sonnenallee 224a, 12059 Berlin',
        coords: '52.474447,13.456046',
        plusCode: 'GCC5+GH'
    },
    'DEKRA': {
        name: 'DEKRA Akademie',
        address: 'Kiehlufer 163, 12057 Berlin',
        coords: '52.478946,13.458246',
        plusCode: 'GCH6+JW'
    },
    'CN': {
        name: 'Colonia Nova',
        address: 'Thiemannstraße 1, 12059 Berlin',
        coords: '52.476946,13.451246',
        plusCode: 'GCC4+XV'
    }
};

// --- Utilities --- //

function removeEmojis(text) {
    if (!text) return text;
    return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu, '');
}

/**
 * RFC 5545 Compliance: Split lines at 75 octets (bytes), not characters.
 * Multibyte characters must not be split in the middle.
 */
function foldLine(line) {
    const encoder = new TextEncoder();
    // Quick check: if total bytes <= 75, return as is.
    if (encoder.encode(line).length <= 75) return line;

    let result = '';
    let currentLine = '';
    let currentBytes = 0;

    for (const char of line) {
        const charBytes = encoder.encode(char).length;

        // If adding this char exceeds 75 bytes
        if (currentBytes + charBytes > 75) {
            result += currentLine + '\r\n '; // Fold with CRLF + Space
            currentLine = char;
            currentBytes = charBytes + 1; // +1 for the indentation
        } else {
            currentLine += char;
            currentBytes += charBytes;
        }
    }
    result += currentLine;
    return result;
}

function normalizeTitle(summary) {
    if (!summary) return summary;
    let clean = removeEmojis(summary);
    clean = clean.replace(/^k_[A-Z0-9_]+\s*-\s*/i, '').trim();
    const words = clean.split(/\s+/);
    return [...new Set(words)].join(' ');
}

// --- Streaming Logic --- //

export class ICalLineUnfolder {
    constructor() {
        this.buffer = '';
        this.decoder = new TextDecoder('utf-8');
        this.encoder = new TextEncoder();
    }

    async processChunk(chunk, controller, enhancer) {
        this.buffer += this.decoder.decode(chunk, { stream: true });
        let eolIndex;
        while ((eolIndex = this.buffer.indexOf('\n')) !== -1) {
            if (eolIndex + 1 >= this.buffer.length) break;
            const nextChar = this.buffer[eolIndex + 1];
            let lineEnd = eolIndex;
            if (eolIndex > 0 && this.buffer[eolIndex - 1] === '\r') lineEnd = eolIndex - 1;

            if (nextChar === ' ' || nextChar === '\t') {
                const before = this.buffer.slice(0, lineEnd);
                const after = this.buffer.slice(eolIndex + 2);
                this.buffer = before + after;
            } else {
                const line = this.buffer.slice(0, lineEnd);
                const processedLines = enhancer.processLine(line);
                for (const l of processedLines) {
                    controller.enqueue(this.encoder.encode(foldLine(l) + '\r\n'));
                }
                this.buffer = this.buffer.slice(eolIndex + 1);
            }
        }
    }

    flush(controller, enhancer) {
        this.buffer += this.decoder.decode();
        if (this.buffer.length > 0) {
            const processedLines = enhancer.processLine(this.buffer);
            for (const l of processedLines) {
                controller.enqueue(this.encoder.encode(foldLine(l) + '\r\n'));
            }
        }
    }
}

export class ICalLineEnhancer {
    constructor() {
        this.inEvent = false;
        this.eventLines = [];
        // Strict allowlist to prevent PII leakage
        this.ALLOWED_PROPS = new Set([
            'DTSTART', 'DTEND', 'DTSTAMP', 'UID',
            'RRULE', 'EXDATE', 'STATUS', 'TRANSP',
            'SEQUENCE', 'RECURRENCE-ID', 'CLASS', 'CREATED', 'LAST-MODIFIED'
        ]);
    }

    processLine(line) {
        if (line.startsWith('BEGIN:VEVENT')) {
            this.inEvent = true;
            this.eventLines = [line];
            return [];
        }

        if (line.startsWith('END:VEVENT')) {
            this.inEvent = false;
            const processed = this.enhanceEvent(this.eventLines);
            processed.push(line);
            this.eventLines = [];
            return processed;
        }

        if (this.inEvent) {
            this.eventLines.push(line);
            return [];
        }

        return [line];
    }

    enhanceEvent(lines) {
        let summary = '';
        let locationRaw = '';
        let courseId = 'N/A';
        const safeLines = [];

        // First pass: Extract & Filter
        for (const line of lines) {
            const separatorIdx = line.indexOf(':');
            const propName = separatorIdx > -1 ? line.substring(0, separatorIdx).split(';')[0] : '';

            if (line.startsWith('SUMMARY:')) {
                const raw = line.substring(8);
                const idMatch = raw.match(/(k_[A-Z0-9_]+)/i);
                if (idMatch) courseId = idMatch[1];
                summary = normalizeTitle(raw);
            } else if (line.startsWith('LOCATION:')) {
                locationRaw = line.substring(9);
            } else if (line.startsWith('BEGIN:VEVENT') || line.startsWith('DESCRIPTION:')) {
                // Skip
            } else {
                // Strict Allowlist Check
                if (this.ALLOWED_PROPS.has(propName)) {
                    safeLines.push(line);
                }
            }
        }

        const enhancedLoc = this.resolveLocation(locationRaw);

        // Final Output Build
        const event = ['BEGIN:VEVENT'];
        event.push(`SUMMARY:${summary}`);

        // 1. Determine Title vs Address
        let uiLabel = `${enhancedLoc.room || locationRaw} - ${enhancedLoc.name}`;
        if (enhancedLoc.key === 'CUBE') {
            const roomNum = (enhancedLoc.room || locationRaw).replace(/CUBE/i, '').trim();
            uiLabel = `${roomNum} - CUBE`; // Fixed spacing
        } else if (enhancedLoc.key === 'Online') {
            uiLabel = 'Online';
        }

        if (enhancedLoc.key === 'Online') {
            event.push('LOCATION:Online');
            event.push('X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="Online";X-APPLE-RADIUS=50;X-TITLE="Online";X-APPLE-REFERENCEFRAME=1:geo:0,0');
        } else {
            // 2. Format LOCATION (Standard Fallback)
            // CRITICAL: Escape commas and semicolons for RFC 5545 compliance
            const rawAddress = enhancedLoc.address || '';
            const escapedAddress = rawAddress.replace(/,/g, '\\,').replace(/;/g, '\\;');
            const escapedLabel = uiLabel.replace(/,/g, '\\,').replace(/;/g, '\\;');

            // Format: "Room-Building\, Address" (with backslash before comma)
            const locString = `${escapedLabel}\\, ${escapedAddress}`;
            event.push(`LOCATION:${locString}`);

            // 3. Format X-APPLE-STRUCTURED-LOCATION (Apple Maps)
            // X-ADDRESS and X-TITLE use RAW strings (unescaped) in quotes.
            event.push(`X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="${rawAddress}";X-APPLE-RADIUS=50;X-TITLE="${uiLabel}";X-APPLE-REFERENCEFRAME=1:geo:${enhancedLoc.coords}`);
        }

        const descParts = [];
        descParts.push(`🆔 Course ID: ${courseId}`);

        if (enhancedLoc.notes) {
            descParts.push(enhancedLoc.notes);
        }

        descParts.push('--------------------------');
        descParts.push(`🗺️ Original: ${locationRaw}`);

        event.push(`DESCRIPTION:${descParts.join('\\n')}`);

        for (const line of safeLines) {
            event.push(line);
        }

        return event;
    }

    resolveLocation(rawLoc) {
        if (!rawLoc || rawLoc.toLowerCase() === 'online') return { key: 'Online', name: 'Online', address: 'Online', coords: '0,0', plusCode: '', notes: '' };

        const roomMatch = rawLoc.match(/([A-D]?\d+\.\d+|CUBE\s+\d+\.\d+|SON\s+\d+\.\d+|Seminar\s+\d+)/i);
        const roomCode = roomMatch ? roomMatch[1] : '';

        let key = 'CUBE';
        if (rawLoc.toUpperCase().includes('KIEHLUFER')) key = 'DEKRA';
        else if (rawLoc.toUpperCase().includes('THIEMANN')) key = 'CN';
        else if (rawLoc.includes('223')) key = 'SON223';
        else if (rawLoc.includes('224a')) key = 'SON224A';
        else if (roomCode) {
            const up = roomCode.toUpperCase();
            if (up.startsWith('CUBE')) key = 'CUBE';
            else {
                const first = up.charAt(0);
                if (CAMPUS_DATA[first]) key = first;
                else if (rawLoc.toUpperCase().includes('CUBE')) key = 'CUBE';
                else if (/^\d/.test(first)) key = 'CUBE';
            }
        }

        const data = CAMPUS_DATA[key] || CAMPUS_DATA['CUBE'];
        return { ...data, key, room: roomCode };
    }
}
