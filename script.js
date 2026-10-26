
const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const fileInfo = $("fileInfo");
const uploadZone = $("uploadZone");
const generateBtn = $("generateBtn");
const resultSection = $("resultSection");
const message = $("message");

let selectedFile = null;
let sourceText = "";
let slides = [];
let currentSlide = 0;

const themes = {
  moderno: ["#252b61", "#7557bd"],
  academico: ["#123b56", "#287e91"],
  corporativo: ["#172b45", "#416c9d"],
  minimalista: ["#30323b", "#555b68"],
  criativo: ["#7a277e", "#df6a8d"],
  hospitalar: ["#075b72", "#39a9b5"]
};

function showMessage(text) {
  message.textContent = text;
  message.classList.remove("hidden");
}

function hideMessage() {
  message.classList.add("hidden");
}

function escapeText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

fileInput.addEventListener("change", async () => {
  hideMessage();

  const file = fileInput.files?.[0];
  if (!file) return;

  const allowedExtensions =
    /\.(pdf|docx|pptx|txt|md|png|jpe?g|webp)$/i;

  if (!allowedExtensions.test(file.name)) {
    fileInput.value = "";
    showMessage("Esse formato ainda não é aceito.");
    return;
  }

  const maxSize = 15 * 1024 * 1024;

  if (file.size > maxSize) {
    fileInput.value = "";
    showMessage("O arquivo ultrapassa o limite de 15 MB desta versão.");
    return;
  }

  selectedFile = file;
  sourceText = "";

  fileInfo.textContent =
    "📄 " + file.name + " · " + formatSize(file.size);
  fileInfo.classList.remove("hidden");

  uploadZone.querySelector("strong").textContent =
    "Arquivo selecionado";

  if (/\.(txt|md)$/i.test(file.name)) {
    try {
      sourceText = await file.text();
      showMessage(
        "Arquivo de texto carregado. Você já pode criar um rascunho local."
      );
    } catch {
      showMessage("Não foi possível ler esse arquivo.");
    }
  } else {
    showMessage(
      "Arquivo selecionado. A leitura de PDF, Word, PowerPoint e imagens será feita pelo servidor, que ainda vamos configurar."
    );
  }
});

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  }
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function splitIntoChunks(text, maxLength = 420) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs.length
    ? paragraphs
    : [text]) {
    if (paragraph.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }

      for (let i = 0; i < paragraph.length; i += maxLength) {
        chunks.push(paragraph.slice(i, i + maxLength));
      }
      continue;
    }

    if ((current + "\n\n" + paragraph).length > maxLength && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? current + "\n\n" + paragraph : paragraph;
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

function makeTitle(text, fallback) {
  const firstLine = text
    .split(/\n/)
    .map(line => line.trim())
    .find(Boolean);

  if (!firstLine) return fallback;

  return firstLine.length > 75
    ? firstLine.slice(0, 72) + "..."
    : firstLine;
}

function buildLocalDraft() {
  const topic = escapeText($("topic").value);
  const count = Number($("count").value);
  const instructions = escapeText($("instructions").value);

  if (!selectedFile && !topic) {
    showMessage("Escolha um arquivo ou informe o tema da apresentação.");
    return false;
  }

  if (selectedFile && !sourceText && !topic) {
    showMessage(
      "Este formato ainda precisa do servidor de análise. Informe o tema para criar um rascunho demonstrativo ou aguarde a próxima etapa."
    );
    return false;
  }

  const material = sourceText.trim();
  const subject = topic ||
    (selectedFile ? selectedFile.name.replace(/\.[^.]+$/, "") : "");

  slides = [{
    title: subject,
    body: "Apresentação sobre " + subject +
      ".\n\nRascunho inicial: revise o conteúdo antes de apresentar."
  }];

  if (material) {
    const chunks = splitIntoChunks(material);
    const usableChunks = chunks.slice(0, count - 2);

    slides.push({
      title: "Introdução",
      body: "Tema: " + subject +
        "\n\nEste rascunho foi montado localmente a partir do texto enviado. " +
        "A organização automática com IA será adicionada na próxima etapa."
    });

    usableChunks.forEach((chunk, index) => {
      slides.push({
        title: makeTitle(chunk, "Ponto importante " + (index + 1)),
        body: chunk
      });
    });
  } else {
    slides.push({
      title: "Contextualização",
      body: "Apresente o assunto, explique por que ele é importante e indique o objetivo da apresentação."
    });

    slides.push({
      title: "Pontos principais",
      body: "Organize aqui as informações, evidências e exemplos mais relevantes do tema."
    });

    slides.push({
      title: "Conclusão",
      body: "Retome os principais pontos e destaque a mensagem que o público deve levar."
    });
  }

  if (instructions) {
    slides[slides.length - 1].body +=
      "\n\nInstruções para revisar: " + instructions;
  }

  slides = slides.slice(0, count);
  currentSlide = 0;

  $("presentationTitle").textContent = subject;
  resultSection.classList.remove("hidden");

  renderSlide();
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });

  showMessage(
    "Rascunho local criado. Ainda não é uma análise por IA. " +
    "Revise os textos e aguarde a integração com o servidor."
  );

  return true;
}

generateBtn.addEventListener("click", () => {
  hideMessage();
  buildLocalDraft();
});

function renderSlide() {
  if (!slides.length) return;

  const slide = slides[currentSlide];

  $("previewTitle").textContent = slide.title;
  $("previewBody").textContent = slide.body;
  $("slideCounter").textContent =
    "Slide " + (currentSlide + 1) + " de " + slides.length;

  $("editTitle").value = slide.title;
  $("editBody").value = slide.body;

  const colors = themes[$("style").value] || themes.moderno;

  $("slideCanvas").style.background =
    `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;

  const dots = $("slideDots");
  dots.replaceChildren();

  slides.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className =
      "slide-dot" + (index === currentSlide ? " active" : "");
    dot.setAttribute("aria-label", "Ir para o slide " + (index + 1));

    dot.addEventListener("click", () => {
      currentSlide = index;
      renderSlide();
    });

    dots.appendChild(dot);
  });

  $("previousBtn").disabled = currentSlide === 0;
  $("nextBtn").disabled = currentSlide === slides.length - 1;
}

$("previousBtn").addEventListener("click", () => {
  if (currentSlide > 0) {
    currentSlide--;
    renderSlide();
  }
});

$("nextBtn").addEventListener("click", () => {
  if (currentSlide < slides.length - 1) {
    currentSlide++;
    renderSlide();
  }
});

$("editBtn").addEventListener("click", () => {
  $("editTitle").focus();
  $("editTitle").scrollIntoView({ behavior: "smooth", block: "center" });
});

$("saveEditBtn").addEventListener("click", () => {
  if (!slides.length) return;

  slides[currentSlide].title =
    $("editTitle").value.trim() || "Slide sem título";

  slides[currentSlide].body = $("editBody").value.trim();

  renderSlide();
  showMessage("Alterações salvas neste rascunho.");
});

$("style").addEventListener("change", () => {
  if (slides.length) renderSlide();
});

$("pptxBtn").addEventListener("click", async () => {
  if (!slides.length) {
    showMessage("Crie uma apresentação antes de exportar.");
    return;
  }

  if (typeof pptxgen === "undefined") {
    showMessage("A biblioteca PowerPoint não carregou. Verifique sua conexão.");
    return;
  }

  try {
    const pptx = new pptxgen();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "SlideIA";
    pptx.subject = $("presentationTitle").textContent;
    pptx.title = $("presentationTitle").textContent;
    pptx.lang = "pt-BR";

    const colors = themes[$("style").value] || themes.moderno;
    const bg = colors[0].replace("#", "");
    const fg = "FFFFFF";

    slides.forEach((slide, index) => {
      const page = pptx.addSlide();
      page.background = { color: bg };

      page.addText("SLIDEIA  /  " + String(index + 1).padStart(2, "0"), {
        x: 0.65, y: 0.45, w: 11.8, h: 0.3,
        fontFace: "Aptos", fontSize: 10,
        color: "C9C3FF", bold: true, margin: 0
      });

      page.addText(slide.title, {
        x: 0.75, y: 1.25, w: 11.6, h: 1.35,
        fontFace: "Aptos Display", fontSize: 28,
        bold: true, color: fg, breakLine: false,
        valign: "mid", margin: 0.05, fit: "shrink"
      });

      page.addText(slide.body, {
        x: 0.8, y: 2.9, w: 11.3, h: 3.7,
        fontFace: "Aptos", fontSize: 18,
        color: "F0F2FF", breakLine: false,
        valign: "top", margin: 0.08, fit: "shrink",
        paraSpaceAfterPt: 12
      });

      page.addText(String(index + 1), {
        x: 12.1, y: 6.9, w: 0.45, h: 0.25,
        fontSize: 10, color: "D1D5FF",
        align: "right", margin: 0
      });
    });

    const filename = ($("presentationTitle").textContent || "slideia")
      .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "slideia";

    await pptx.writeFile({ fileName: filename + ".pptx" });
    showMessage("PowerPoint gerado!");
  } catch (error) {
    console.error(error);
    showMessage("Não foi possível gerar o PowerPoint. Tente novamente.");
  }
});

$("pdfBtn").addEventListener("click", () => {
  if (!slides.length) {
    showMessage("Crie uma apresentação antes de imprimir.");
    return;
  }

  const originalIndex = currentSlide;
  const canvas = $("slideCanvas");
  const originalDisplay = canvas.style.display;

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    showMessage("O navegador bloqueou a janela. Permita pop-ups e tente novamente.");
    return;
  }

  const pages = slides.map((slide, index) => {
    const colors = themes[$("style").value] || themes.moderno;

    return `
      <section class="page" style="background:linear-gradient(135deg,${colors[0]},${colors[1]})">
        <div class="label">SLIDEIA / ${String(index + 1).padStart(2, "0")}</div>
        <h1>${escapeHtml(slide.title)}</h1>
        <p>${escapeHtml(slide.body).replace(/\n/g, "<br>")}</p>
        <div class="number">${index + 1}</div>
      </section>`;
  }).join("");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Apresentação - SlideIA</title>
      <style>
        *{box-sizing:border-box}
        @page{size:13.333in 7.5in;margin:0}
        body{margin:0;font-family:Arial,sans-serif}
        .page{width:13.333in;height:7.5in;padding:.65in;
          color:white;position:relative;page-break-after:always;
          break-after:page;overflow:hidden;
          -webkit-print-color-adjust:exact;print-color-adjust:exact}
        .label{font-size:12pt;letter-spacing:2px;color:#d8d2ff}
        h1{font-size:30pt;line-height:1.2;margin:1.1in 0 .35in}
        p{font-size:19pt;line-height:1.5;white-space:normal;overflow-wrap:anywhere}
        .number{position:absolute;right:.65in;bottom:.35in}
        @media screen{.page{max-width:100%;height:auto;aspect-ratio:16/9}}
      </style>
    </head>
    <body>${pages}
      <script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
});

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
