import type { Editor } from '@tiptap/core';

/*
 * The rimshot of a comedy project: "ba-dum-tss" after a punchline. Two drum hits and a cymbal, made with
 * the Web Audio API, so no sound file loads. A small "ba-dum-tss!" rises at the cursor, and the page says it
 * for a screen reader. Calm mode and reduced motion keep the words still (tokens.css).
 */

let context: AudioContext | null = null;

/** A drum hit: a tone that drops in pitch and dies away. */
function drum(ctx: AudioContext, at: number, from: number, to: number) {
  const tone = ctx.createOscillator();
  const level = ctx.createGain();
  tone.frequency.setValueAtTime(from, at);
  tone.frequency.exponentialRampToValueAtTime(to, at + 0.15);
  level.gain.setValueAtTime(0.5, at);
  level.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
  tone.connect(level).connect(ctx.destination);
  tone.start(at);
  tone.stop(at + 0.22);
}

/** The cymbal: white noise above 6 kHz that fades over most of a second. */
function cymbal(ctx: AudioContext, at: number) {
  const length = Math.floor(ctx.sampleRate * 0.8);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 6000;
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.35, at);
  level.gain.exponentialRampToValueAtTime(0.001, at + 0.8);
  noise.connect(high).connect(level).connect(ctx.destination);
  noise.start(at);
}

function play() {
  try {
    context ??= new AudioContext();
    void context.resume();
    const now = context.currentTime + 0.02;
    drum(context, now, 220, 140);
    drum(context, now + 0.18, 160, 90);
    cymbal(context, now + 0.4);
  } catch {
    // A browser with no Web Audio still shows the words.
  }
}

function show(editor: Editor) {
  const { left, top } = editor.view.coordsAtPos(editor.state.selection.head);
  const words = document.createElement('div');
  words.className = 'vlo-rimshot';
  words.setAttribute('role', 'status');
  words.textContent = 'ba-dum-tss!';
  words.style.left = `${String(left)}px`;
  words.style.top = `${String(top)}px`;
  document.body.append(words);
  window.setTimeout(() => {
    words.remove();
  }, 1400);
}

export function rimshot(editor: Editor): boolean {
  play();
  show(editor);
  return true;
}
