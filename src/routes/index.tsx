import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import {
  UploadCloud,
  Play,
  Pause,
  Mic2,
  Music2,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

const SEPARATE_ENDPOINT = import.meta.env.VITE_SEPARATE_ENDPOINT as
  | string
  | undefined;

function formatTime(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function base64ToBlobUrl(b64: string, mimeType: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

// Calls the Modal `separate` endpoint with the uploaded file and
// returns object URLs for the vocals and instrumental MP3 blobs.
async function separateAudio(
  file: File
): Promise<{ vocalsUrl: string; instrumentalUrl: string }> {
  if (!SEPARATE_ENDPOINT) {
    throw new Error(
      "No separation backend configured. Set VITE_SEPARATE_ENDPOINT in your .env file."
    );
  }

  const formData = new FormData();
  formData.append("audio_file", file);

  const res = await fetch(SEPARATE_ENDPOINT, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Separation request failed (${res.status})`);
  }

  const { vocals_b64, instrumental_b64 } = (await res.json()) as {
    vocals_b64: string;
    instrumental_b64: string;
  };

  const vocalsUrl = base64ToBlobUrl(vocals_b64, "audio/mpeg");
  const instrumentalUrl = base64ToBlobUrl(instrumental_b64, "audio/mpeg");

  return { vocalsUrl, instrumentalUrl };
}

function StemTrack({
  label,
  icon,
  colorVar,
  url,
  volume,
  onVolume,
  playing,
  seekTo,
  onReady,
  onProgress,
  isLeader,
}: {
  label: string;
  icon: React.ReactNode;
  colorVar: string;
  url: string;
  volume: number;
  onVolume: (v: number) => void;
  playing: boolean;
  seekTo: number | null;
  onReady?: (duration: number) => void;
  onProgress?: (t: number) => void;
  isLeader?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [ready, setReady] = useState(false);
  const muted = volume === 0;

  useEffect(() => {
    if (!containerRef.current) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: `oklch(from var(${colorVar}) l c h / 0.35)`,
      progressColor: `var(${colorVar})`,
      cursorColor: "oklch(1 0 0 / 0.4)",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      barRadius: 3,
      height: 88,
      normalize: true,
      url,
    });
    wsRef.current = ws;
    ws.on("ready", () => {
      setReady(true);
      ws.setVolume(volume);
      onReady?.(ws.getDuration());
    });
    if (isLeader) {
      ws.on("audioprocess", (t) => onProgress?.(t));
      ws.on("seeking", (t) => onProgress?.(t));
    }
    return () => {
      ws.destroy();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    wsRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    if (playing) ws.play();
    else ws.pause();
  }, [playing, ready]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready || seekTo === null) return;
    const d = ws.getDuration();
    if (d > 0) ws.seekTo(Math.min(1, Math.max(0, seekTo / d)));
  }, [seekTo, ready]);

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-5 transition-colors hover:border-white/20">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `oklch(from var(${colorVar}) l c h / 0.15)`,
              color: `var(${colorVar})`,
            }}
          >
            {icon}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">
              {muted ? "Muted" : `${Math.round(volume * 100)}%`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 w-56">
          <button
            type="button"
            onClick={() => onVolume(muted ? 0.8 : 0)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolume(parseFloat(e.target.value))}
            className="stem-slider flex-1"
            style={
              {
                ["--stem-color" as string]: `var(${colorVar})`,
                ["--stem-fill" as string]: `${volume * 100}%`,
              } as React.CSSProperties
            }
            aria-label={`${label} volume`}
          />
        </div>
      </div>
      <div ref={containerRef} className="w-full" />
      {!ready && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Loading waveform…
        </div>
      )}
    </div>
  );
}

function Index() {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [vocalsUrl, setVocalsUrl] = useState<string | null>(null);
  const [instrumentalUrl, setInstrumentalUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [separating, setSeparating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seek, setSeek] = useState<number | null>(null);
  const [vocalsVol, setVocalsVol] = useState(0.9);
  const [instrVol, setInstrVol] = useState(0.9);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith("audio/")) return;

    setPlaying(false);
    setError(null);
    setSeparating(true);
    setFileName(f.name);
    setVocalsUrl(null);
    setInstrumentalUrl(null);

    // Keep a local preview URL in case separation fails, so the user
    // still sees what they uploaded.
    const localPreview = URL.createObjectURL(f);
    setOriginalUrl(localPreview);

    try {
      const { vocalsUrl: vUrl, instrumentalUrl: iUrl } = await separateAudio(f);
      setVocalsUrl(vUrl);
      setInstrumentalUrl(iUrl);
    } catch (err) {
      console.error("Separation failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while separating this track. Please try again."
      );
    } finally {
      setSeparating(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => {
    setPlaying(false);
    setOriginalUrl(null);
    setVocalsUrl(null);
    setInstrumentalUrl(null);
    setFileName("");
    setCurrent(0);
    setDuration(0);
    setError(null);
  };

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setSeek(t);
    setCurrent(t);
    requestAnimationFrame(() => setSeek(null));
  };

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (vocalsUrl) URL.revokeObjectURL(vocalsUrl);
      if (instrumentalUrl) URL.revokeObjectURL(instrumentalUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalUrl, vocalsUrl, instrumentalUrl]);

  const hasStems = !!vocalsUrl && !!instrumentalUrl;

  return (
    <main
      className="min-h-screen text-foreground relative overflow-hidden"
      style={{ backgroundImage: "var(--gradient-hero)" }}
    >
      <div className="mx-auto max-w-5xl px-6 py-10 md:py-16">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight">Stemly</div>
              <div className="text-xs text-muted-foreground">AI stem separation</div>
            </div>
          </div>
          {originalUrl && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
            >
              <RotateCcw size={14} /> New song
            </button>
          )}
        </header>

        {!originalUrl && (
          <section className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Split any song into{" "}
              <span style={{ color: "var(--vocals)" }}>vocals</span> and{" "}
              <span style={{ color: "var(--instrumentals)" }}>instrumentals</span>
            </h1>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Drop a track below. We'll separate it with AI — then mix the two stems
              live with simple volume sliders.
            </p>
          </section>
        )}

        {!originalUrl ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`group relative cursor-pointer rounded-3xl border-2 border-dashed p-14 md:p-20 text-center transition-all ${
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border bg-card/40 hover:border-white/25 hover:bg-card/60"
            }`}
            style={{ boxShadow: dragOver ? "var(--shadow-glow)" : undefined }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary transition-transform group-hover:scale-105">
              <UploadCloud size={28} />
            </div>
            <div className="mt-6 text-lg font-medium">Drop a song here</div>
            <div className="mt-1 text-sm text-muted-foreground">
              or click to browse — MP3, WAV, FLAC up to 50MB
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-5">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {separating ? "Processing" : "Now playing"}
                  </div>
                  <div className="mt-0.5 truncate text-base font-medium">{fileName}</div>
                </div>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  disabled={!hasStems}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                  style={{ boxShadow: hasStems ? "var(--shadow-glow)" : undefined }}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
                </button>
              </div>

              {separating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                  <Loader2 size={14} className="animate-spin" />
                  Processing on GPU…
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {hasStems && (
                <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                  <span>{formatTime(current)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.01}
                    value={current}
                    onChange={onScrub}
                    className="stem-slider flex-1"
                    style={
                      {
                        ["--stem-color" as string]: "var(--primary)",
                        ["--stem-fill" as string]: `${
                          duration ? (current / duration) * 100 : 0
                        }%`,
                      } as React.CSSProperties
                    }
                    aria-label="Seek"
                  />
                  <span>{formatTime(duration)}</span>
                </div>
              )}
            </div>

            {hasStems && (
              <>
                <StemTrack
                  label="Vocals"
                  icon={<Mic2 size={18} />}
                  colorVar="--vocals"
                  url={vocalsUrl!}
                  volume={vocalsVol}
                  onVolume={setVocalsVol}
                  playing={playing}
                  seekTo={seek}
                  isLeader
                  onReady={(d) => setDuration(d)}
                  onProgress={(t) => setCurrent(t)}
                />
                <StemTrack
                  label="Instrumentals"
                  icon={<Music2 size={18} />}
                  colorVar="--instrumentals"
                  url={instrumentalUrl!}
                  volume={instrVol}
                  onVolume={setInstrVol}
                  playing={playing}
                  seekTo={seek}
                />

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <a
                    href={vocalsUrl!}
                    download={`${fileName.replace(/\.[^/.]+$/, "")}-vocals.mp3`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
                  >
                    Download vocals
                  </a>
                  <a
                    href={instrumentalUrl!}
                    download={`${fileName.replace(/\.[^/.]+$/, "")}-instrumental.mp3`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
                  >
                    Download instrumental
                  </a>
                </div>

                <p className="text-center text-xs text-muted-foreground pt-2">
                  Tip: pull a slider to 0 to solo the other stem.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
