/**
 * Image generation via an OpenAI-compatible Images API
 * (POST {IMAGE_API_URL}/v1/images/generations).
 *
 * Env vars (all optional — image features degrade gracefully when unset):
 *   IMAGE_API_URL   base URL, e.g. https://api.openai.com
 *   IMAGE_API_KEY   provider key
 *   IMAGE_MODEL     default "gpt-image-1"
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 */
import { storagePut } from "server/storage";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  const apiUrl = process.env.IMAGE_API_URL ?? "";
  const apiKey = process.env.IMAGE_API_KEY ?? "";
  const model = process.env.IMAGE_MODEL || "gpt-image-1";

  if (!apiUrl || !apiKey) {
    throw new Error(
      "Image generation not configured: set IMAGE_API_URL and IMAGE_API_KEY " +
        "(OpenAI-compatible /v1/images/generations endpoint)"
    );
  }

  const endpoint = `${apiUrl.replace(/\/+$/, "")}/v1/images/generations`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: options.prompt,
      n: 1,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${
        detail ? `: ${detail}` : ""
      }`
    );
  }

  const result = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  const item = result.data?.[0];

  if (item?.url) {
    return { url: item.url };
  }

  // Some providers return base64 only — persist it to storage and return a URL.
  if (item?.b64_json) {
    const buffer = Buffer.from(item.b64_json, "base64");
    const { url } = await storagePut(
      `generated-images/${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
      buffer,
      "image/png"
    );
    return { url };
  }

  return {};
}
