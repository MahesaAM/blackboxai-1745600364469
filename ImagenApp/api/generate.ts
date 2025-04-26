import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const API_URL = "https://aisandbox-pa.googleapis.com/v1:runImageFx";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function POST(request: Request) {
  try {
    const { prompt, aspectRatio } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt harus diisi!" }, { status: 400 });
    }

    // ambil token dari header jika ada
    let bearerToken = "";
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      bearerToken = authHeader.substring(7);
    }

    // fallback: fetch dari Supabase settings
    if (!bearerToken) {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "BEARER_TOKEN")
        .single();
      if (error || !data?.value) {
        console.error("Supabase token error:", error);
        return NextResponse.json({ error: "API token tidak dikonfigurasi" }, { status: 500 });
      }
      bearerToken = data.value;
    }

    // siapkan body untuk Google API
    const requestBody = {
      userInput: {
        candidatesCount: 4,
        prompts: [prompt],
        seed: Date.now() % 1000000,
      },
      clientContext: {
        sessionId: `;${Date.now()}`,
        tool: "IMAGE_FX",
      },
      modelInput: { modelNameType: "IMAGEN_3_1" },
      aspectRatio,
    };

    // timeout 20s
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        accept: "*/*",
        authorization: `Bearer ${bearerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await response.text();
    if (!response.ok) {
      // parse error
      let msg = `Error ${response.status}: ${response.statusText}`;
      try {
        const err = JSON.parse(text);
        msg = err.error?.message || err.message || msg;
      } catch {}
      if (response.status === 408) msg = "Request timeout.";
      if (response.status === 401) msg = "Token tidak valid atau kadaluwarsa.";
      if (response.status === 429) msg = "Rate limit terlampaui. Coba lagi nanti.";
      return NextResponse.json({ error: msg }, { status: response.status });
    }

    const data = JSON.parse(text);
    const panels = data.imagePanels;
    if (!panels?.length) {
      return NextResponse.json({ error: "Tidak ada gambar dihasilkan." }, { status: 500 });
    }

    // ambil panel pertama
    const generated = panels[0].generatedImages as any[];
    const images = generated.map((img, idx) => {
      const url = `data:image/jpeg;base64,${img.encodedImage}`;
      const safe = prompt.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
      const filename = `${safe}_${Date.now()}_${idx + 1}.jpg`;
      return { filename, url };
    });

    return NextResponse.json({ prompt, images });
  } catch (err: any) {
    console.error("API /generate error:", err);
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "Timeout ke AI API." }, { status: 408 });
    }
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
