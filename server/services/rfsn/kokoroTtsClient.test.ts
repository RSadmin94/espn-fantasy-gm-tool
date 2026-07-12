import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesizeAnalystSpeech } from "./kokoroTtsClient";

const ENV = {
  ENABLED: "RFSN_TTS_ENABLED",
  URL: "RFSN_TTS_SERVICE_URL",
  TOKEN: "RFSN_TTS_SERVICE_TOKEN",
  TIMEOUT: "RFSN_TTS_TIMEOUT_MS",
};

function wavBytes(): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  return Buffer.concat([header, Buffer.from([0, 0, 0, 0])]);
}

describe("kokoroTtsClient", () => {
  beforeEach(() => {
    process.env[ENV.ENABLED] = "true";
    process.env[ENV.URL] = "https://kokoro.example";
    process.env[ENV.TOKEN] = "secret-token";
    process.env[ENV.TIMEOUT] = "5000";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env[ENV.ENABLED];
    delete process.env[ENV.URL];
    delete process.env[ENV.TOKEN];
    delete process.env[ENV.TIMEOUT];
  });

  it("makes zero requests when disabled", async () => {
    process.env[ENV.ENABLED] = "false";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(synthesizeAnalystSpeech({ voice: "sofia", text: "hello" })).rejects.toThrow("tts disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends bearer token server-side", async () => {
    const body = wavBytes();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, { status: 200, headers: { "content-type": "audio/wav" } }),
    );
    await synthesizeAnalystSpeech({ voice: "sofia", text: "Tony Dorsey just reached." });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
    expect(JSON.stringify((init as RequestInit).body)).toContain("sofia");
  });

  it("rejects unsupported voice locally", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(synthesizeAnalystSpeech({ voice: "narrator", text: "hello" })).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enforces input length cap", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(wavBytes(), { status: 200, headers: { "content-type": "audio/wav" } }),
    );
    const long = "a".repeat(600);
    await synthesizeAnalystSpeech({ voice: "coach", text: long });
    const [, init] = fetchSpy.mock.calls[0]!;
    const payload = JSON.parse(String((init as RequestInit).body));
    expect(payload.text.length).toBeLessThanOrEqual(500);
  });

  it("rejects non-wav responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not audio", { status: 200, headers: { "content-type": "text/plain" } }),
    );
    await expect(synthesizeAnalystSpeech({ voice: "roxanne", text: "hello" })).rejects.toThrow("invalid response");
  });

  it("accepts valid wav", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(wavBytes(), { status: 200, headers: { "content-type": "audio/wav" } }),
    );
    const result = await synthesizeAnalystSpeech({ voice: "sofia", text: "hello" });
    expect(result.contentType).toBe("audio/wav");
    expect(result.bytes.length).toBeGreaterThan(44);
  });

  it("sanitizes upstream 4xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 400 }));
    await expect(synthesizeAnalystSpeech({ voice: "sofia", text: "hello" })).rejects.toThrow("invalid request");
  });
});
