const HF_SPACE_BASE =
"https://cbensimon-wan2-2-fp8da-aoti-preview2.hf.space";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

function json(data, status = 200, extraHeaders = {}) {
return new Response(JSON.stringify(data), {
status,
headers: {
"Content-Type": "application/json; charset=utf-8",
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
"Access-Control-Allow-Headers": "Content-Type",
...extraHeaders
}
});
}

export default {
async fetch(request) {
const url = new URL(request.url);

if (request.method === "OPTIONS") {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

if (url.pathname === "/health" && request.method === "GET") {
  return json({
    ok: true,
    app: "VibeMotion AI",
    message: "Worker is running"
  });
}

if (url.pathname !== "/generate" || request.method !== "POST") {
  return json({
    error: "Not found. Try GET /health or POST /generate."
  }, 404);
}

try {
  const form = await request.formData();
  const image = form.get("image");
  const rawParams = form.get("params");

  if (!(image instanceof File) || !image.type.startsWith("image/")) {
    return json({ error: "Please upload an image." }, 400);
  }

  if (image.size > MAX_IMAGE_SIZE) {
    return json({
      error: "The image must be 8 MB or smaller."
    }, 413);
  }

  let params = {};

  try {
    const parsed = JSON.parse(
      typeof rawParams === "string" ? rawParams : "{}"
    );

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      params = parsed;
    }
  } catch {
    return json({ error: "The params field must contain valid JSON." }, 400);
  }

  const prompt =
    typeof params.prompt === "string" && params.prompt.trim()
      ? params.prompt.trim().slice(0, 1000)
      : "Animate this image with smooth, natural cinematic motion.";

  const uploadForm = new FormData();
  uploadForm.append("files", image, image.name || "input.png");

  const uploadResponse = await fetch(
    `${HF_SPACE_BASE}/gradio_api/upload`,
    {
      method: "POST",
      body: uploadForm
    }
  );

  if (!uploadResponse.ok) {
    return json({
      error: "The public AI demo could not accept the image. Try again later."
    }, 502);
  }

  const uploadedFiles = await uploadResponse.json();
  const imagePath = Array.isArray(uploadedFiles)
    ? uploadedFiles[0]
    : null;

  if (typeof imagePath !== "string" || !imagePath) {
    return json({
      error: "The AI demo returned an unexpected upload result."
    }, 502);
  }

  const imageData = {
    path: imagePath,
    url: `${HF_SPACE_BASE}/gradio_api/file=${imagePath}`,
    orig_name: image.name || "input.png",
    size: image.size,
    mime_type: image.type,
    meta: { _type: "gradio.FileData" }
  };

  const duration = Math.max(
    0.5,
    Math.min(4.5, Number(params.duration_seconds) || 3.5)
  );

  const data = [
    imageData,
    null,
    prompt,
    6,
    "blurry, low quality, distorted face, deformed body",
    duration,
    1,
    1,
    42,
    true,
    6,
    "UniPCMultistep",
    3.0,
    16,
    false,
    true
  ];

  const submitResponse = await fetch(
    `${HF_SPACE_BASE}/gradio_api/call/generate_video`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data })
    }
  );

  if (!submitResponse.ok) {
    return json({
      error: "The AI demo rejected the generation request."
    }, 502);
  }

  const job = await submitResponse.json();

  if (!job.event_id) {
    return json({
      error: "The AI demo did not return a generation job ID."
    }, 502);
  }

  const resultResponse = await fetch(
    `${HF_SPACE_BASE}/gradio_api/call/generate_video/${job.event_id}`,
    { headers: { Accept: "text/event-stream" } }
  );

  if (!resultResponse.ok || !resultResponse.body) {
    return json({
      error: "Could not receive the AI video result."
    }, 502);
  }

  return new Response(resultResponse.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
} catch {
  return json({
    error: "Generation failed. The public AI demo may be temporarily unavailable."
  }, 502);
}

}
};
