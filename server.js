
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const AdmZip = require("adm-zip");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origem não autorizada."));
  }
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1
  },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    const accepted = [
      ".pdf", ".docx", ".pptx", ".txt", ".md",
      ".png", ".jpg", ".jpeg", ".webp"
    ];

    if (!accepted.includes(extension)) {
      return callback(new Error("Formato de arquivo não aceito."));
    }

    callback(null, true);
  }
});

function getAI() {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error("A chave GEMINI_API_KEY não foi configurada no servidor.");
  }

  return new GoogleGenAI({ apiKey: key });
}

function cleanText(value, maxLength = 2000) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

async function extractDocument(file) {
  const extension = path.extname(file.originalname).toLowerCase();

  if (extension === ".txt" || extension === ".md") {
    return {
      text: file.buffer.toString("utf8").slice(0, 100000),
      image: null
    };
  }

  if (extension === ".pdf") {
    const result = await pdfParse(file.buffer);
    return {
      text: (result.text || "").slice(0, 100000),
      image: null
    };
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({
      buffer: file.buffer
    });

    return {
      text: (result.value || "").slice(0, 100000),
      image: null
    };
  }

  if (extension === ".pptx") {
    const zip = new AdmZip(file.buffer);
    const entries = zip.getEntries()
      .filter(entry =>
        /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName)
      )
      .sort((a, b) => {
        const getNumber = name =>
          Number(name.match(/slide(\d+)\.xml$/)?.[1] || 0);
        return getNumber(a.entryName) - getNumber(b.entryName);
      });

    const parts = entries.map((entry, index) => {
      const xml = entry.getData().toString("utf8");
      const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map(match => match[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"));

      return `Slide ${index + 1}:\n${texts.join(" ")}`;
    });

    return {
      text: parts.join("\n\n").slice(0, 100000),
      image: null
    };
  }

  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    const mimeTypes = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp"
    };

    return {
      text: "",
      image: {
        mimeType: mimeTypes[extension],
        data: file.buffer.toString("base64")
      }
    };
  }

  throw new Error("Não foi possível reconhecer esse formato.");
}

function extractJSON(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    throw new Error("A IA não retornou um resultado válido.");
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    server: "online",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

app.post("/api/generate", upload.single("file"), async (req, res) => {
  try {
    const topic = cleanText(req.body.topic, 500);
    const instructions = cleanText(req.body.instructions, 2000);
    const style = cleanText(req.body.style, 50) || "moderno";
    const audience = cleanText(req.body.audience, 100) || "geral";
    const count = Math.min(
      20,
      Math.max(3, Number.parseInt(req.body.count, 10) || 8)
    );

    if (!req.file && !topic) {
      return res.status(400).json({
        error: "Envie um arquivo ou informe o tema."
      });
    }

    let document = { text: "", image: null };

    if (req.file) {
      document = await extractDocument(req.file);
    }

    if (!document.text.trim() && !document.image && !topic) {
      return res.status(422).json({
        error: "Não encontramos texto no arquivo. Tente outro documento ou informe o tema."
      });
    }

    const prompt = `
Você é um especialista em transformar documentos em apresentações.

Crie uma apresentação em português brasileiro com exatamente ${count} slides.

TEMA INFORMADO: ${topic || "Identifique no documento"}
PÚBLICO: ${audience}
ESTILO VISUAL: ${style}
INSTRUÇÕES ADICIONAIS: ${instructions || "Nenhuma"}

REGRAS:
- Use o documento como fonte principal.
- Não invente dados, estatísticas, citações ou referências.
- Se uma informação estiver ausente, não a apresente como fato.
- Organize o conteúdo com introdução, desenvolvimento e conclusão.
- Cada slide deve ter um título curto e conteúdo conciso.
- Evite parágrafos longos; prefira tópicos quando apropriado.
- Não repita a mesma informação em vários slides.
- Não coloque instruções para a IA nos slides.
- Para gráficos, sugira apenas os que podem ser fundamentados nos dados fornecidos.
- Se o material for insuficiente, deixe isso claro no conteúdo, sem inventar.
- Produza texto adequado para leitura em uma apresentação.

Responda SOMENTE com JSON válido neste formato:
{
  "title": "Título da apresentação",
  "slides": [
    {
      "title": "Título do slide",
      "body": "Texto do slide",
      "visualSuggestion": "Sugestão visual opcional"
    }
  ]
}

O array slides deve conter exatamente ${count} elementos.
`;

    const contents = [{ text: prompt }];

    if (document.text.trim()) {
      contents.push({
        text: "\nDOCUMENTO ENVIADO:\n" +
          document.text.slice(0, 100000)
      });
    }

    if (document.image) {
      contents.push({
        inlineData: {
          mimeType: document.image.mimeType,
          data: document.image.data
        }
      });
    }

    const ai = getAI();

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents
    });

    const result = extractJSON(response.text);

    if (!Array.isArray(result.slides) || !result.slides.length) {
      throw new Error("A IA não retornou slides suficientes.");
    }

    const safeSlides = result.slides.slice(0, count).map(slide => ({
      title: cleanText(slide.title, 180) || "Slide sem título",
      body: cleanText(slide.body, 4000),
      visualSuggestion: cleanText(slide.visualSuggestion, 300)
    }));

    res.json({
      title: cleanText(result.title, 180) || topic || "Minha apresentação",
      slides: safeSlides
    });
  } catch (error) {
    console.error("Erro ao gerar apresentação:", error.message);

    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        error: "O arquivo excedeu o limite permitido ou não pôde ser recebido."
      });
    }

    res.status(500).json({
      error: "Não foi possível gerar a apresentação. Confira a configuração do servidor e tente novamente."
    });
  }
});

// Entrega somente os arquivos públicos da interface.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/script.js", (req, res) => {
  res.sendFile(path.join(__dirname, "script.js"));
});

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({
      error: err.message || "Não foi possível processar a solicitação."
    });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`SlideIA rodando na porta ${PORT}`);
});
