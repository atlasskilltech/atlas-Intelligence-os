/**
 * Browser side of an OpenAI Realtime voice session over WebRTC.
 * The server (/api/voice/realtime) creates a short-lived client secret; the browser
 * sends its microphone straight to OpenAI and plays the reply audio. Events (captions,
 * tool calls, turn changes) arrive on the "oai-events" data channel.
 */
export async function connectRealtime({ clientSecret, callsUrl, micStream, audioCtx, onEvent, onState }) {
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  let analyser = null;

  pc.ontrack = (e) => {
    const stream = e.streams[0];
    audio.srcObject = stream;
    audio.play().catch(() => {});
    try {
      // Level for the orb only — not connected to the speakers (the <audio> plays it).
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
    } catch {
      analyser = null;
    }
  };
  pc.onconnectionstatechange = () => onState?.(pc.connectionState);

  for (const track of micStream.getAudioTracks()) pc.addTrack(track, micStream);
  const dc = pc.createDataChannel("oai-events");
  dc.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      /* ignore malformed events */
    }
  };

  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Realtime connection timed out.")), 15_000);
    dc.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
  });

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(callsUrl, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
    });
    if (!res.ok) throw new Error(`Realtime connection failed (${res.status}).`);
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    await opened;
  } catch (err) {
    pc.close();
    throw err;
  }

  return {
    send(event) {
      if (dc.readyState === "open") dc.send(JSON.stringify(event));
    },
    getAnalyser: () => analyser,
    close() {
      try {
        dc.close();
      } catch {
        /* already closed */
      }
      pc.getSenders().forEach((s) => s.track && pc.removeTrack(s));
      pc.close();
      audio.pause();
      audio.srcObject = null;
    },
  };
}
