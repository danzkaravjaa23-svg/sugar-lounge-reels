// Canvas + хөгжмийг MediaRecorder-оор бичиж, видео файл (MP4, эс бол WebM) гаргана.
// Бодит хугацаанд бичдэг: 15с reel ≈ 15с хүлээнэ.

const MIME_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export async function exportReel({ canvas, player, audio, fps, signal, onProgress }) {
  const mimeType = pickMimeType();
  if (mimeType === null) throw new Error('Энэ хөтөч видео бичих боломжгүй байна (MediaRecorder алга).');

  const stream = canvas.captureStream(fps);
  if (audio.buffer) {
    await audio.resume();
    const dest = audio.ctx.createMediaStreamDestination();
    audio.setOutput(dest);
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }

  const recorder = new MediaRecorder(stream, {
    ...(mimeType && { mimeType }),
    videoBitsPerSecond: 10_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (e) => reject(e.error || new Error('Бичлэг хийхэд алдаа гарлаа'));
  });

  const onTime = () => onProgress?.(player.t / player.duration);
  player.addEventListener('time', onTime);
  let cancelled = false;
  try {
    await player.prepare(0);
    if (signal?.aborted) throw new DOMException('Цуцлагдлаа', 'AbortError');
    const finished = new Promise((resolve) => {
      player.addEventListener('ended', resolve, { once: true });
      signal?.addEventListener('abort', () => {
        cancelled = true;
        player.pause();
        resolve();
      }, { once: true });
    });
    recorder.start(500);
    player.play(0);
    await finished;
    await new Promise((r) => setTimeout(r, 200)); // сүүлийн кадруудыг бичигдэх хугацаа
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  } finally {
    player.removeEventListener('time', onTime);
    if (recorder.state !== 'inactive') recorder.stop();
    audio.setOutput(null);
  }
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  if (cancelled) throw new DOMException('Цуцлагдлаа', 'AbortError');

  const type = (recorder.mimeType || mimeType || 'video/webm').split(';')[0];
  return new Blob(chunks, { type });
}
