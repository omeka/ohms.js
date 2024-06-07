"use strict";

async function getCachefile(url) {
    const response = await fetch(url);
    return response.text();
}

async function parse(url) {
    const cachefile = await getCachefile(url);
    const parser = new DOMParser;
    const doc = parser.parseFromString(cachefile, 'application/xml');
    const record = doc.documentElement.querySelector('record');

    const data = {
        title: getChildText(record, 'title'),
        accession: getChildText(record, 'accession'),
        sync: getChildText(record, 'sync'),
        sync_alt: getChildText(record, 'sync_alt'),
        duration: getChildText(record, 'duration'),
        collection_name: getChildText(record, 'collection_name'),
        collection_link: getChildText(record, 'collection_link'),
        series_name: getChildText(record, 'series_name'),
        series_link: getChildText(record, 'series_link'),
        fmt: getChildText(record, 'fmt'),
        media_url: getChildText(record, 'media_url'),
        file_name: getChildText(record, 'file_name'),
        rights: getChildText(record, 'rights'),
        usage: getChildText(record, 'usage'),
        repository: getChildText(record, 'repository'),
        kembed: getChildText(record, 'kembed'),
        language: getChildText(record, 'language'),
        transcript_alt_lang: getChildText(record, 'transcript_alt_lang'),
        translate: getChildText(record, 'translate'),
        funding: getChildText(record, 'funding'),
        user_notes: getChildText(record, 'user_notes'),
        transcript: getChildText(record, 'transcript'),
        transcript_alt: getChildText(record, 'transcript_alt'),
    }

    const mediafile = record.querySelector('mediafile');
    data['media_host'] = getChildText(mediafile, 'host');
    data['media_host_account_id'] = getChildText(mediafile, 'host_account_id');
    data['media_host_player_id'] = getChildText(mediafile, 'host_player_id');
    data['media_host_clip_id'] = getChildText(mediafile, 'host_clip_id');
    data['media_clip_format'] = getChildText(mediafile, 'clip_format');

    console.log(data);
    return data;
}

function getChildText(element, childName) {
    const child = element.querySelector(':scope > ' + childName)
    return child ? child.textContent : null;
}

function parseSyncString(sync) {
    const syncParts = sync.split(':');
    if (!syncParts.length === 2) {
        return {};
    }

    let chunkSize = parseInt(syncParts[0], 10);
    if (!chunkSize) {
        chunkSize = 1;
    }

    const syncLines = syncParts[1].replace(/\(.*?\)/g, '').split('|');

    const syncData = new Map();
    syncData.set(0, 0);
    syncLines.forEach((syncLine, index) => {
        const lineMinutes = (index) * chunkSize;
        const lineNumber = parseInt(syncLine, 10);

        if (!lineNumber) {
            return;
        }

        syncData.set(lineNumber, lineMinutes);
    });

    return syncData;
}

function formatTime(seconds) {
    const h = (Math.floor(seconds / 3600) + '').padStart(2, '0');
    const m = (Math.floor((seconds % 3600) / 60) + '').padStart(2, '0');
    const s = (Math.floor(seconds % 60) + '').padStart(2, '0');

    return h + ':' + m + ':' + s;
}

function displayTranscript(transcript, sync) {
    const lines = transcript.split('\n');
    const frag = document.createDocumentFragment();
    const speakerRegex = /^\s*([A-Z-.\' ]+:)(.*)$/;
    const syncData = parseSyncString(sync);

    let para = document.createElement('p');
    let paraNew = true;
    lines.forEach((line, index) => {
        const lineLength = line.trim().length;
        // blank line: new paragraph
        if (lineLength === 0 && para.childElementCount > 0) {
            frag.appendChild(para);
            para = document.createElement('p');
            paraNew = true;
        }

        const span = document.createElement('span');

        const syncPoint = syncData.get(index);
        if (typeof syncPoint === 'number') {
            const link = document.createElement('a');
            const seconds = syncPoint * 60;
            link.dataset.seconds = seconds;
            link.textContent = formatTime(seconds);
            link.href = '#';
            span.appendChild(link);
        }
        if (paraNew) {
            const matches = line.match(speakerRegex);
            if (matches) {
                const speaker = document.createElement('b');
                speaker.textContent = matches[1];
                span.appendChild(speaker);
                line = matches[2];
            }
        } 
        span.appendChild(document.createTextNode(line));

        para.appendChild(span);
        para.appendChild(document.createTextNode('\n'));

        if (lineLength > 0) {
            paraNew = false;
        }
    });
    document.querySelector('#transcript').appendChild(frag);
}

function displayMedia(data) {
    const player = document.querySelector('#player');
    if (data.media_host === 'Vimeo') {
        const parser = new DOMParser;
        const embedDoc = parser.parseFromString(data.kembed, 'text/html');
        const iframe = embedDoc.querySelector('iframe');
        const videoUrl = iframe.src;

        const script = document.createElement('script');
        script.src = 'https://player.vimeo.com/api/player.js';
        script.addEventListener('load', () => {
            const vimeoContainer = document.createElement('div');
            vimeoContainer.id = 'vimeo-player';
            player.appendChild(vimeoContainer);

            const vimeoPlayer = new Vimeo.Player('vimeo-player', {url: videoUrl}); 
        });
        document.body.appendChild(script);
    }
}

async function main(url) {
    const data = await parse(url);
    displayMedia(data);
    displayTranscript(data.transcript, data.sync);
}
