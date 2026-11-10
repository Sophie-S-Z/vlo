/*
 * Records the writer's voice with MediaRecorder (roadmap F57, plan Task K9). The audio stays on this
 * device, in the research files of the memory.
 */

export interface Recording {
  /** The loudness now, from 0 to 1, for the level meter. */
  level: () => number;
  /** Ends the recording and gives its audio. */
  stop: () => Promise<Blob>;
  /** Ends the recording and drops its audio. */
  cancel: () => void;
}

/** Starts a recording. The browser asks the writer for the microphone the first time. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const parts: Blob[] = [];
  recorder.ondataavailable = (event) => {
    parts.push(event.data);
  };
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const end = () => {
    for (const track of stream.getTracks()) track.stop();
    void context.close();
  };
  recorder.start();
  return {
    level: () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      // Speech is quiet next to full scale, so the meter shows the loudness at 4 times.
      return Math.min(1, Math.sqrt(sum / samples.length) * 4);
    },
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          end();
          resolve(new Blob(parts, { type: recorder.mimeType }));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = end;
      recorder.stop();
    },
  };
}
