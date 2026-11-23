
const MP3_RATES = {
    3: [44100, 48000, 32000], // MPEG-1
    2: [22050, 24000, 16000], // MPEG-2
    0: [11025, 12000, 8000],  // MPEG-2.5
};

/** Reads the sample rate from the first MP3 frame header (skipping an ID3v2 tag). */
function mp3SampleRate(bytes) {
    let p = 0;
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) { // "ID3"
        const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
        p = 10 + size + ((bytes[5] & 0x10) ? 10 : 0);
    }
    for (; p < bytes.length - 3; p++) {
        if (bytes[p] === 0xFF && (bytes[p + 1] & 0xE0) === 0xE0) {
            const version = (bytes[p + 1] >> 3) & 3;
            const rateIndex = (bytes[p + 2] >> 2) & 3;
            const rate = MP3_RATES[version]?.[rateIndex];
            if (rate) return rate;
        }
    }
    return null;
}

class SoundSprites {
    #ctx = null;
    #audio = null;
    #timesByMarker = null;

    constructor(audio, markers, context) {
        this.#audio = audio;
        this.#ctx = context;
        this.#timesByMarker = Object.fromEntries(
            markers.map(marker => [marker.name, [marker.tStart, marker.tEnd]])
        );
    }


    async play(markerName) {
        const source = this.#ctx.createBufferSource();
        source.buffer = this.#audio;
        source.connect(this.#ctx.destination);

        if (markerName in this.#timesByMarker) {
            // Calculate duration and schedule exact playback
            const [t0, t1] = this.#timesByMarker[markerName];
            source.start(0, t0, t1-t0);
        }
    }

    static async load(url, audioCtx = new AudioContext()) {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();

        const td = new TextDecoder(); 
        const u32 = new Uint32Array(arrayBuffer);
        const nTracks = u32[0];

        let i = 1;
        let soundSpriteMarkers = new Array(nTracks).fill(0).map((_, t) => {
            let iStart = u32[i++];
            let iEnd = u32[i++];
            let nameLength = u32[i++];

            let nameStart = i * 4;
            let nameEnd = nameStart + nameLength;
            let name = td.decode(arrayBuffer.slice(nameStart, nameEnd));
            name = name.trim().replace(/\0/g, '');

            i += Math.ceil(nameLength / 4);
          
            return {
                iStart,
                iEnd,
                name
            };
        })

        const audioBuffer = arrayBuffer.slice(i * 4, arrayBuffer.byteLength);
        // Markers are sample indices at the file's own rate. decodeAudioData resamples
        // to the context's rate (often 48kHz on iPhone), so read the source rate first.
        const sourceRate = mp3SampleRate(new Uint8Array(audioBuffer)) ?? 44100;
        const audio = await audioCtx.decodeAudioData(audioBuffer);

        soundSpriteMarkers = soundSpriteMarkers.map(marker => {
            let {iStart, iEnd} = marker;
            return {
                ...marker,
                tStart: iStart / sourceRate,
                tEnd: iEnd / sourceRate
            }
        });

        return new SoundSprites(audio, soundSpriteMarkers, audioCtx);
    }
}


export {SoundSprites}