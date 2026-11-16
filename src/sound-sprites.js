
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
            console.log(`Playing marker ${markerName} from ${t0} to ${t1}`);
            source.start(0, t0, t1-t0);
        }
    }

    static async load(dir, audioCtx = new AudioContext()) {
        const res = await fetch(`${dir}/sound-sprites.smp3`);
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
        const audio = await audioCtx.decodeAudioData(audioBuffer);

        soundSpriteMarkers = soundSpriteMarkers.map(marker => {
            let {iStart, iEnd} = marker;
            return {
                ...marker, 
                tStart: iStart / audio.sampleRate, 
                tEnd: iEnd / audio.sampleRate
            }
        });

        return new SoundSprites(audio, soundSpriteMarkers, audioCtx);
    }
}


export {SoundSprites}