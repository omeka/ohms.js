"use strict";

let jumpToTime;

async function getCachefile(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Fetch failed (${response.status})`);
    }
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
        vtt_transcript: getChildText(record, 'vtt_transcript'),
        vtt_transcript_alt: getChildText(record, 'vtt_transcript_alt'),
    }

    const mediafile = record.querySelector('mediafile');
    data['media_host'] = getChildText(mediafile, 'host');
    data['media_host_account_id'] = getChildText(mediafile, 'host_account_id');
    data['media_host_player_id'] = getChildText(mediafile, 'host_player_id');
    data['media_host_clip_id'] = getChildText(mediafile, 'host_clip_id');
    data['media_clip_format'] = getChildText(mediafile, 'clip_format');

    const indexPoints = record.querySelectorAll(':scope > index > point');
    data.index_points = Array.from(indexPoints, (point) => {
        const pointData = {
            time: parseInt(getChildText(point, 'time'), 10),
            title: getChildText(point, 'title'),
            title_alt: getChildText(point, 'title_alt'),
            partial_transcript: getChildText(point, 'partial_transcript'),
            partial_transcript_alt: getChildText(point, 'partial_transcript_alt'),
            synopsis: getChildText(point, 'synopsis'),
            synopsis_alt: getChildText(point, 'synopsis_alt'),
            keywords: getChildText(point, 'keywords'),
            keywords_alt: getChildText(point, 'keywords_alt'),
            subjects: getChildText(point, 'subjects'),
            subjects_alt: getChildText(point, 'subjects_alt'),
        };
        const gpsPoints = point.querySelectorAll(':scope > gpspoints');
        pointData.gps_points = Array.from(gpsPoints, (gpspoint) => {
            return {
                gps: getChildText(gpspoint, 'gps'),
                gps_zoom: getChildText(gpspoint, 'gps_zoom'),
                gps_text: getChildText(gpspoint, 'gps_text'),
                gps_text_alt: getChildText(gpspoint, 'gps_text_alt'),
            };
        });
        return pointData;
    });

    return data;
}

function getChildText(element, childName) {
    const child = element.querySelector(':scope > ' + childName)
    return child ? child.textContent : '';
}

function parseSyncString(sync) {
    const syncParts = sync.split(':');
    const syncData = new Map();
    if (syncParts.length !== 2) {
        return syncData;
    }

    let chunkSize = parseInt(syncParts[0], 10);
    if (!chunkSize) {
        chunkSize = 1;
    }

    const syncLines = syncParts[1].replace(/\(.*?\)/g, '').split('|');

    syncData.set(0, 0);
    syncLines.forEach((syncLine, index) => {
        const lineSeconds = (index) * chunkSize * 60;
        const lineNumber = parseInt(syncLine, 10);

        if (!lineNumber) {
            return;
        }

        syncData.set(lineNumber, lineSeconds);
    });

    return syncData;
}

function formatTime(seconds) {
    const h = (Math.floor(seconds / 3600) + '').padStart(2, '0');
    const m = (Math.floor((seconds % 3600) / 60) + '').padStart(2, '0');
    const s = (Math.floor(seconds % 60) + '').padStart(2, '0');

    return h + ':' + m + ':' + s;
}

function displayTranscript(transcript, sync, indexPoints) {
    const [realTranscript, footnoteContainer] = extractFootnotes(transcript);
    const lines = realTranscript.split('\n');
    const transcriptContainer = document.querySelector('#transcript');
    const frag = document.createDocumentFragment();
    const speakerRegex = /^\s*([A-Z-.\' ]+:)(.*)$/;
    const footnoteRegex = /\[\[footnote\]\]([0-9]+?)\[\[\/footnote\]\]/;
    const syncData = parseSyncString(sync);

    const indexData = getIndexLines(syncData, indexPoints, lines.length);

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
            span.appendChild(createElement('a', {
                dataset: {seconds: syncPoint},
                textContent: formatTime(syncPoint),
                href: '#',
                className: 'timestamp-link',
            }));
        }

        const indexPoint = indexData.get(index);
        if (typeof indexPoint === 'number') {
            span.appendChild(createElement('a', {
                href: '#index-point-' + indexPoint,
                textContent: 'i',
                className: 'index-link',
                id: 'transcript-index-point-' + indexPoint,
            }));
        }
        if (paraNew) {
            const matches = line.match(speakerRegex);
            if (matches) {
                span.appendChild(createElement('b', {textContent: matches[1]}));
                line = matches[2];
            }
        }
        const footnoteSplit = line.split(footnoteRegex);
        footnoteSplit.forEach((str, index) => {
            if (index % 2 === 0) {
                span.appendChild(document.createTextNode(str));
            } else {
                span.appendChild(createElement('a', {
                    textContent: '[' + str + ']',
                    id: 'fr' + str,
                    href: '#fn' + str,
                    className: 'footnote-link',
                }));
            }
        });

        para.appendChild(span);
        para.appendChild(document.createTextNode('\n'));

        if (lineLength > 0) {
            paraNew = false;
        }
    });
    transcriptContainer.appendChild(frag);
    if (footnoteContainer) {
        transcriptContainer.appendChild(footnoteContainer);
    }
}

function getIndexLines(syncData, indexPoints) {
    const indexData = new Map();
    const syncArray = Array.from(syncData);

    if (syncArray.length === 0) {
        return indexData;
    }

    let syncIndex = 0;
    let [currentLine, currentTime] = syncArray[syncIndex];

    indexPoints.forEach((indexPoint, i) => {
        const indexTime = indexPoint.time;
        while (currentTime < indexTime && syncIndex < syncArray.length) {
            syncIndex++;
            [currentLine, currentTime] = syncArray[syncIndex];
        }
        if (currentTime > indexTime) {
            let [previousLine, previousTime] = syncArray[syncIndex - 1];
            let betweenLine = previousLine + Math.round((currentLine - previousLine) / (currentTime - previousTime) * (indexTime - previousTime));
            indexData.set(betweenLine, i);
        } else {
            indexData.set(currentLine, i);
        }

    });
    return indexData;
}

function extractFootnotes(transcript) {
    const regex = /\[\[footnotes\]\](.*)\[\[\/footnotes\]\]/s;
    const noteRegex = /\[\[note\]\](.*?)\[\[\/note\]\]/sg;
    const noteLinkRegex = /\[\[link\]\](.*?)\[\[\/link\]\]/s;
    const urlRegex = /^https?:\/\//;
    const matches = transcript.split(regex);
    if (matches.length === 1) {
        return [transcript, null];
    } else {
        const footnotes = matches[1];
        const noteMatches = footnotes.matchAll(noteRegex);

        const footnoteContainer = createElement('div', {className: 'footnote-container'});
        footnoteContainer.appendChild(createElement('h2', {textContent: 'Footnotes'}));

        let footnoteIndex = 1;
        for (const noteMatch of noteMatches) {
            const footnote = createElement('p', {id: 'fn' + footnoteIndex});

            footnote.appendChild(createElement('a', {
                textContent: footnoteIndex,
                href: '#fr' + footnoteIndex,
                className: 'footnote-linkback',
            }));
            footnote.appendChild(document.createTextNode(' '));

            let noteContents = noteMatch[1];
            let noteUrl;
            noteContents = noteContents.replace(noteLinkRegex, (linkMatch, linkText) => {
                noteUrl = linkText.trim();
                return '';
            });
            if (noteUrl) {
                if (!urlRegex.test(noteUrl)) {
                    noteUrl = 'http://' + noteUrl;
                }
                footnote.appendChild(createElement('a', {
                    href: noteUrl,
                    textContent: noteContents.trim(),
                }));
            } else {
               footnote.appendChild(document.createTextNode(noteContents.trim()));
            }
            footnoteContainer.appendChild(footnote);
            footnoteIndex++;
        }
        return [matches[0], footnoteContainer];
    }
}

function displayVttTranscript(vttTranscript, indexPoints) {
    const timingsRegex = /(^.*-->.*$)/m
    const voiceTagRegex = /<v(?:\.[^ \t>]+)?[ \t]([^>]*)>/
    const vttTagRegex = /<\/?[^>]*>/g
    const postCueRegex = /\n\n.*/ms
    const frag = document.createDocumentFragment();
    const vttArray = vttTranscript.split(timingsRegex);
    let previousTimestamp = null;
    for (let i = 1; i < vttArray.length; i+=2) {
        const timingsLine = vttArray[i];
        const caption = vttArray[i+1];
        const timestamp = parseVttTimestamp(timingsLine);

        const para = document.createElement('p');
        const span = document.createElement('span');

        if (timestamp !== previousTimestamp) {
            span.appendChild(createElement('a', {
                dataset: {seconds: timestamp},
                textContent: formatTime(timestamp),
                href: '#',
                className: 'timestamp-link',
            }));
            previousTimestamp = timestamp;
        }

        caption.replace(postCueRegex, '').split(voiceTagRegex).forEach((captionText, j) => {
            if (j % 2 === 1) {
                span.appendChild(createElement('b', {textContent: captionText + ': '}));
            } else {
                span.appendChild(document.createTextNode(captionText.replaceAll(vttTagRegex, '')));
            }
        });

        para.appendChild(span);
        frag.appendChild(para);
    }

    document.querySelector('#transcript').appendChild(frag);
}

function parseVttTimestamp(timestamp) {
    const timestampRegex = /(?:([0-9]{2}):)?([0-9]{2}):([0-9]{2})\.([0-9]{3})/
    const match = timestamp.match(timestampRegex);
    let hours = 0, minutes = 0, seconds = 0;
    if (!match) {
        return null;
    }

    if (match[1]) {
        hours = parseInt(match[1], 10);
    }
    minutes = parseInt(match[2], 10);
    seconds = parseInt(match[3], 10);

    if (minutes > 59 || seconds > 59) {
        return null;
    }
    return (hours * 3600) + (minutes * 60) + seconds;
}

function displayMedia(data) {
    const player = document.querySelector('#player');
    const host = data.media_host.toLowerCase();
    switch (host) {
        case 'vimeo':
            let videoUrl;
            if (data.media_url) {
                videoUrl = data.media_url;
            } else if (data.kembed) {
                const parser = new DOMParser;
                const embedDoc = parser.parseFromString(data.kembed, 'text/html');
                const iframe = embedDoc.querySelector('iframe');
                videoUrl = iframe.src;
            } else {
                break;
            }

            {
                const script = document.createElement('script');
                script.src = 'https://player.vimeo.com/api/player.js';
                script.addEventListener('load', () => {
                    const vimeoPlayer = new Vimeo.Player(player, {url: videoUrl});

                    jumpToTime = async (seconds) => {
                        await vimeoPlayer.setCurrentTime(seconds);
                        if (await vimeoPlayer.getPaused()) {
                            vimeoPlayer.play();
                        }
                    };
                });
                document.body.appendChild(script);
            }
            break;
        case 'youtube':
            let videoId;
            if (data.media_url) {
                videoId = data.media_url.replace(/^https?:\/\/youtu.be\//, '');
            } else if (data.kembed) {
                const parser = new DOMParser;
                const embedDoc = parser.parseFromString(data.kembed, 'text/html');
                const iframe = embedDoc.querySelector('iframe');
                videoId = new URL(iframe.src).pathname.replace(/^\/embed\//, '');
            }
            {
                const script = document.createElement('script');
                script.src = 'https://www.youtube.com/iframe_api';
                window.onYouTubeIframeAPIReady = function () {
                    const ytContainer = document.createElement('div');
                    ytContainer.id = 'youtube-player';
                    player.appendChild(ytContainer);
                    const ytPlayer = new YT.Player('youtube-player', {
                        width: '640',
                        height: '390',
                        videoId: videoId,
                        playerVars: {playsinline: 1}
                    });

                    jumpToTime = (seconds) => {
                        ytPlayer.seekTo(seconds, true);
                        if (ytPlayer.getPlayerState() !== 1) {
                            ytPlayer.playVideo();
                        }
                    };
                }
                document.body.appendChild(script);
            }
            break;
        case 'aviary':
            const url = new URL(data.media_url);
            if (!url.hostname.endsWith('.aviaryplatform.com')) {
                break;
            }

            player.appendChild(createElement('iframe', {
                src: data.media_url,
                width: 480,
                height: 270,
            }));

            break;
        case 'kaltura':
            if (data.kembed) {
                const parser = new DOMParser;
                const embedDoc = parser.parseFromString(data.kembed, 'text/html');
                const iframe = embedDoc.querySelector('iframe');
                const kalturaUrlRegex = /\/p\/([0-9]+)\/sp\/(?:[0-9]+)00\/embedIframeJs\/uiconf_id\/([0-9]+)\//;
                const iframeUrl = new URL(iframe.src);
                const query = new URLSearchParams(iframeUrl.search);
                const match = iframeUrl.pathname.match(kalturaUrlRegex);
                if (!match || !query.has('entry_id')) {
                    break;
                }
                const partnerId = match[1];
                const uiconfId = match[2];
                const entryId = query.get('entry_id');

                const script = document.createElement('script');
                script.src = `https://cdnapisec.kaltura.com/p/${partnerId}/sp/${partnerId}00/embedIframeJs/uiconf_id/${uiconfId}/partner_id/${partnerId}`;
                script.addEventListener('load', () => {
                    kWidget.embed({
                        targetId: 'player',
                        wid: '_' + partnerId,
                        uiconf_id: uiconfId,
                        entry_id: entryId,
                        readyCallback: (playerId) => {
                            const kdp = document.getElementById(playerId);

                            jumpToTime = (seconds) => {
                                kdp.sendNotification('doSeek', seconds);
                                kdp.sendNotification('doPlay');
                            }
                        }
                    });
                });
                document.body.appendChild(script);
            }

            break;
    }
}

function displayIndex(indexPoints, translate) {
    let titleKey, partialTranscriptKey, synopsisKey;
    if (translate) {
        titleKey = 'title_alt';
        partialTranscriptKey = 'partial_transcript_alt';
        synopsisKey = 'synopsis_alt';
    } else {
        titleKey = 'title';
        partialTranscriptKey = 'partial_transcript';
        synopsisKey = 'synopsis';
    }
    const index = document.querySelector('#index');
    const frag = document.createDocumentFragment();
    indexPoints.forEach((indexPoint, i) => {
        const div = createElement('div', {
            className: 'index-point',
            id: 'index-point-' + i,
        });

        div.appendChild(createElement('span', {
            className: 'index-title',
            textContent: indexPoint[titleKey],
        }));

        div.appendChild(createElement('a', {
            dataset: {seconds: indexPoint.time},
            className: 'timestamp-link',
            textContent: formatTime(indexPoint.time),
            href: '#',
        }));

        div.appendChild(createElement('a', {
            href: '#transcript-index-point-' + i,
            className: 'transcript-index-link',
            textContent: 'View in transcript',
        }));

        if (indexPoint.partial_transcript) {
            div.appendChild(createElement('blockquote', {
                className: 'index-partial-transcript',
                textContent: indexPoint[partialTranscriptKey],
            }));
        }

        if (indexPoint.synopsis) {
            div.appendChild(createElement('span', {
                className: 'index-synopsis',
                textContent: indexPoint[synopsisKey],
            }));
        }
        frag.appendChild(div);
    });
    index.appendChild(frag);
}

function displayMetadata(data) {
    const metadata = document.querySelector('#main-metadata');
    const frag = document.createDocumentFragment();
    const title = data['title'] || 'Untitled';
    document.title = title;

    frag.appendChild(createElement('h1', {textContent: title}));

    frag.appendChild(createElement('span', {
        className: 'repository',
        textContent: data['repository'],
    }));

    metadata.appendChild(frag);
}

function createElement(tagName, properties) {
    const element = document.createElement(tagName);
    if (Object.hasOwn(properties, 'dataset')) {
        for (const [key, value] of Object.entries(properties.dataset)) {
            element.dataset[key] = value;
        }
        delete properties.dataset;
    }
    Object.assign(element, properties);
    return element;
}

function setListeners() {
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        if (!target.matches('a.timestamp-link')) {
            return;
        }
        e.preventDefault();
        if (jumpToTime && 'seconds' in target.dataset) {
            jumpToTime(target.dataset.seconds);
        }
    });
}

async function main(url) {
    if (!url) {
        return;
    }
    const data = await parse(url);
    const translate = false;
    setListeners();
    displayMetadata(data);
    displayMedia(data);

    let transcript, vttTranscript, sync;
    if (translate) {
        transcript = data.transcript_alt;
        vttTranscript = data.vtt_transcript_alt;
        sync = data.sync_alt;
    } else {
        transcript = data.transcript;
        vttTranscript = data.vtt_transcript;
        sync = data.sync;
    }
    if (vttTranscript) {
        displayVttTranscript(vttTranscript, data.index_points);
    } else {
        displayTranscript(transcript, sync, data.index_points);
    }
    displayIndex(data.index_points, translate);
}
