(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fileInput = $("audio-file");
  const dropZone = $("drop-zone");
  const fileRow = $("file-row");
  const fileName = $("file-name");
  const fileMeta = $("file-meta");
  const waveform = $("waveform");
  const waveWrap = $("wave-wrap");
  const placeholder = $("wave-placeholder");
  const startInput = $("start-time");
  const endInput = $("end-time");
  const currentTime = $("current-time");
  const totalTime = $("total-time");
  const selectionLabel = $("selection-label");
  const status = $("status");
  const player = $("player");
  const previewButton = $("play-selection");
  const trimButton = $("trim-download");
  const removeButton = $("remove-file");
  const ctx = waveform.getContext("2d");

  let audioBuffer = null;
  let sourceFile = null;
  let objectUrl = null;
  let audioContext = null;
  let duration = 0;
  let startSeconds = 0;
  let endSeconds = 0;
  let isDragging = false;
  let dragStart = 0;
  let previewSource = null;
  let previewStartedAt = 0;
  let previewOffset = 0;
  let previewAnimation = null;

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.className = "status" + (kind ? " " + kind : "");
  }

  function formatTime(seconds, hundredths = false) {
    seconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const mins = Math.floor(seconds / 60);
    const secs = seconds - mins * 60;
    if (hundredths) return String(mins).padStart(2, "0") + ":" + secs.toFixed(2).padStart(5, "0");
    return String(mins).padStart(2, "0") + ":" + String(Math.floor(secs)).padStart(2, "0");
  }

  function parseTime(value) {
    const s = value.trim();
    if (!s) return NaN;
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s); // seconds
    const parts = s.split(":");
    if (parts.length === 2 && parts.every(p => /^\d+(\.\d+)?$/.test(p))) {
      const seconds = Number(parts[1]);
      if (seconds >= 60) return NaN;
      return Number(parts[0]) * 60 + seconds;
    }
    return NaN;
  }

  function resizeCanvas() {
    const rect = waveform.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    waveform.width = Math.max(1, Math.floor(rect.width * dpr));
    waveform.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWaveform();
  }

  function drawWaveform(playhead = null) {
    const w = waveform.clientWidth;
    const h = waveform.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a1120";
    ctx.fillRect(0, 0, w, h);
    if (!audioBuffer) return;

    const data = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / w));
    const mid = h / 2;
    const maxAmp = h * 0.42;
    const sx = startSeconds / duration * w;
    const ex = endSeconds / duration * w;

    // Selection background
    ctx.fillStyle = "rgba(111, 77, 255, .22)";
    ctx.fillRect(sx, 0, Math.max(0, ex - sx), h);

    for (let x = 0; x < w; x++) {
      const i = x * step;
      let min = 1, max = -1;
      const end = Math.min(data.length, i + step);
      for (let j = i; j < end; j++) {
        const v = data[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const selected = x >= sx && x <= ex;
      ctx.strokeStyle = selected ? "#a58bff" : "#536987";
      ctx.globalAlpha = selected ? 1 : .72;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + .5, mid + min * maxAmp);
      ctx.lineTo(x + .5, mid + max * maxAmp);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Selection handles and borders
    ctx.strokeStyle = "#c6b8ff";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, 5); ctx.lineTo(sx, h - 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex, 5); ctx.lineTo(ex, h - 5); ctx.stroke();
    [sx, ex].forEach(x => {
      ctx.fillStyle = "#f2efff";
      ctx.beginPath(); ctx.arc(x, mid, 5, 0, Math.PI * 2); ctx.fill();
    });

    if (playhead !== null) {
      const px = playhead / duration * w;
      ctx.strokeStyle = "#48d6ad";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    }
  }

  function updateSelectionUI() {
    startInput.value = formatTime(startSeconds, true);
    endInput.value = formatTime(endSeconds, true);
    selectionLabel.textContent = `${formatTime(startSeconds)} – ${formatTime(endSeconds)} (${(endSeconds - startSeconds).toFixed(2)} sec)`;
    drawWaveform();
    const valid = audioBuffer && startSeconds >= 0 && endSeconds <= duration && endSeconds > startSeconds;
    previewButton.disabled = !valid;
    trimButton.disabled = !valid;
  }

  function applyTimeInputs(changed) {
    if (!audioBuffer) return;
    const start = parseTime(startInput.value);
    const end = parseTime(endInput.value);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      setStatus("Please enter valid times, such as 00:12.50. You can also enter seconds, such as 12.5.", "error");
      return;
    }
    if (start < 0 || end > duration || end <= start) {
      setStatus("Choose a start time before the end time, within the audio duration.", "error");
      return;
    }
    startSeconds = start;
    endSeconds = end;
    updateSelectionUI();
    setStatus("Selection updated. Preview it or download the trimmed MP3.", "success");
  }

  async function loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|ogg|aac|flac|webm|opus|aiff?)$/i.test(file.name)) {
      setStatus("That file does not look like an audio file. Please choose an audio file.", "error");
      return;
    }
    stopPreview();
    setStatus("Loading and decoding audio… large files may take a little while.");
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") await audioContext.resume();
      const bytes = await file.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(bytes.slice(0));
      audioBuffer = decoded;
      sourceFile = file;
      duration = decoded.duration;
      startSeconds = 0;
      endSeconds = duration;
      fileName.textContent = file.name;
      fileMeta.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB · ${formatTime(duration)} · ${decoded.numberOfChannels} channel(s)`;
      fileRow.classList.remove("hidden");
      placeholder.classList.add("hidden");
      currentTime.textContent = "00:00";
      totalTime.textContent = formatTime(duration);
      player.classList.add("hidden");
      updateSelectionUI();
      setStatus("Audio loaded. Drag across the waveform or edit the start/end times.", "success");
      resizeCanvas();
    } catch (error) {
      console.error(error);
      audioBuffer = null;
      sourceFile = null;
      fileRow.classList.add("hidden");
      placeholder.classList.remove("hidden");
      previewButton.disabled = true;
      trimButton.disabled = true;
      setStatus("This audio format could not be decoded by your browser. Try converting it to WAV or MP3 and upload it again.", "error");
    }
  }

  function pointToSeconds(event) {
    const rect = waveform.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    return duration * x / rect.width;
  }

  waveform.addEventListener("pointerdown", event => {
    if (!audioBuffer) return;
    isDragging = true;
    dragStart = pointToSeconds(event);
    waveform.setPointerCapture?.(event.pointerId);
    startSeconds = dragStart;
    endSeconds = Math.min(duration, dragStart + 0.05);
    updateSelectionUI();
  });
  waveform.addEventListener("pointermove", event => {
    if (!isDragging || !audioBuffer) return;
    const current = pointToSeconds(event);
    startSeconds = Math.min(dragStart, current);
    endSeconds = Math.max(dragStart, current);
    if (endSeconds - startSeconds < 0.05) endSeconds = Math.min(duration, startSeconds + 0.05);
    updateSelectionUI();
  });
  waveform.addEventListener("pointerup", event => {
    if (!isDragging) return;
    isDragging = false;
    const current = pointToSeconds(event);
    startSeconds = Math.min(dragStart, current);
    endSeconds = Math.max(dragStart, current);
    if (endSeconds - startSeconds < 0.05) {
      startSeconds = Math.max(0, Math.min(duration - 0.05, current - 0.025));
      endSeconds = Math.min(duration, startSeconds + 0.05);
    }
    updateSelectionUI();
    setStatus("Selection updated. Preview it or download the trimmed MP3.", "success");
  });
  waveform.addEventListener("pointercancel", () => { isDragging = false; });

  startInput.addEventListener("change", () => applyTimeInputs("start"));
  endInput.addEventListener("change", () => applyTimeInputs("end"));
  startInput.addEventListener("keydown", e => { if (e.key === "Enter") applyTimeInputs("start"); });
  endInput.addEventListener("keydown", e => { if (e.key === "Enter") applyTimeInputs("end"); });

  function stopPreview() {
    if (previewSource) {
      try { previewSource.stop(); } catch (_) {}
      try { previewSource.disconnect(); } catch (_) {}
      previewSource = null;
    }
    if (previewAnimation) cancelAnimationFrame(previewAnimation);
    previewAnimation = null;
    currentTime.textContent = formatTime(startSeconds);
    if (audioBuffer) drawWaveform();
  }

  function animatePreview() {
    if (!previewSource || !audioContext) return;
    const elapsed = audioContext.currentTime - previewStartedAt;
    const now = previewOffset + elapsed;
    currentTime.textContent = formatTime(Math.min(now, endSeconds));
    drawWaveform(Math.min(now, endSeconds));
    if (now < endSeconds) previewAnimation = requestAnimationFrame(animatePreview);
  }

  previewButton.addEventListener("click", async () => {
    if (!audioBuffer) return;
    stopPreview();
    try {
      if (audioContext.state === "suspended") await audioContext.resume();
      previewSource = audioContext.createBufferSource();
      previewSource.buffer = audioBuffer;
      previewSource.connect(audioContext.destination);
      previewOffset = startSeconds;
      previewStartedAt = audioContext.currentTime;
      previewSource.start(0, startSeconds, endSeconds - startSeconds);
      previewSource.onended = () => {
        if (previewSource) {
          previewSource.disconnect();
          previewSource = null;
        }
        if (previewAnimation) cancelAnimationFrame(previewAnimation);
        previewAnimation = null;
        currentTime.textContent = formatTime(startSeconds);
        drawWaveform();
      };
      setStatus("Playing your selected section…", "success");
      animatePreview();
    } catch (error) {
      console.error(error);
      setStatus("Could not preview this selection. Please try again.", "error");
    }
  });

  function floatTo16BitPCM(floatSamples) {
    const output = new Int16Array(floatSamples.length);
    for (let i = 0; i < floatSamples.length; i++) {
      const sample = Math.max(-1, Math.min(1, floatSamples[i]));
      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
  }

  async function resampleForMp3(buffer, start, end, targetRate = 44100) {
    const first = Math.floor(start * buffer.sampleRate);
    const last = Math.min(buffer.length, Math.floor(end * buffer.sampleRate));
    const frameCount = last - first;
    if (frameCount <= 0) throw new Error("The selected audio section is empty.");

    const segment = new AudioBuffer({
      length: frameCount,
      numberOfChannels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate
    });
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      segment.copyToChannel(buffer.getChannelData(channel).subarray(first, last), channel);
    }
    if (buffer.sampleRate === targetRate) return segment;

    const outputLength = Math.max(1, Math.ceil(frameCount * targetRate / buffer.sampleRate));
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) throw new Error("This browser cannot resample audio for MP3 export.");
    const offline = new OfflineCtx(buffer.numberOfChannels, outputLength, targetRate);
    const source = offline.createBufferSource();
    source.buffer = segment;
    source.connect(offline.destination);
    source.start(0);
    return await offline.startRendering();
  }

  async function encodeMp3(buffer, start, end) {
    if (!window.lamejs || !window.lamejs.Mp3Encoder) {
      throw new Error("The MP3 encoder did not load. Check your internet connection and reload this page.");
    }
    const segment = await resampleForMp3(buffer, start, end, 44100);
    const channels = Math.min(2, segment.numberOfChannels);
    const encoder = new window.lamejs.Mp3Encoder(channels, 44100, 128);
    const left = floatTo16BitPCM(segment.getChannelData(0));
    const right = channels === 2 ? floatTo16BitPCM(segment.getChannelData(1)) : null;
    const blockSize = 1152;
    const chunks = [];

    for (let i = 0; i < left.length; i += blockSize) {
      const l = left.subarray(i, Math.min(i + blockSize, left.length));
      const encoded = channels === 2
        ? encoder.encodeBuffer(l, right.subarray(i, Math.min(i + blockSize, right.length)))
        : encoder.encodeBuffer(l);
      if (encoded && encoded.length) chunks.push(new Int8Array(encoded));
    }
    const finalChunk = encoder.flush();
    if (finalChunk && finalChunk.length) chunks.push(new Int8Array(finalChunk));
    return new Blob(chunks, { type: "audio/mpeg" });
  }

  trimButton.addEventListener("click", async () => {
    if (!audioBuffer || endSeconds <= startSeconds) return;
    const originalLabel = trimButton.textContent;
    trimButton.disabled = true;
    trimButton.textContent = "Encoding MP3…";
    try {
      stopPreview();
      setStatus("Encoding your selected audio as MP3. Longer clips may take a little while.");
      const blob = await encodeMp3(audioBuffer, startSeconds, endSeconds);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = (sourceFile?.name || "audio").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");
      a.href = objectUrl;
      a.download = `${base}-trimmed.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      player.src = objectUrl;
      player.classList.remove("hidden");
      setStatus(`Done! Downloaded ${formatTime(endSeconds - startSeconds)} of audio as MP3 (128 kbps).`, "success");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "MP3 export failed. Try a shorter clip or reload the page.", "error");
    } finally {
      trimButton.textContent = originalLabel;
      trimButton.disabled = !(audioBuffer && endSeconds > startSeconds && endSeconds <= duration);
    }
  });

  function clearFile() {
    stopPreview();
    audioBuffer = null;
    sourceFile = null;
    duration = 0;
    startSeconds = 0;
    endSeconds = 0;
    fileInput.value = "";
    fileRow.classList.add("hidden");
    placeholder.classList.remove("hidden");
    player.pause();
    player.removeAttribute("src");
    player.load();
    player.classList.add("hidden");
    currentTime.textContent = "00:00";
    totalTime.textContent = "00:00";
    selectionLabel.textContent = "Load an audio file to begin";
    startInput.value = "00:00.00";
    endInput.value = "00:00.00";
    previewButton.disabled = true;
    trimButton.disabled = true;
    ctx.clearRect(0, 0, waveform.clientWidth, waveform.clientHeight);
    setStatus("Choose an audio file to get started.");
  }

  fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
  removeButton.addEventListener("click", clearFile);

  ["dragenter", "dragover"].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  }));
  dropZone.addEventListener("drop", event => {
    const file = event.dataTransfer?.files?.[0];
    if (file) loadFile(file);
  });

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
})();
