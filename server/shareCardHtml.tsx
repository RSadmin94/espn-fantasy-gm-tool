/**
 * RFSN-053G — SSR the 053F ShareCardRenderer into isolated HTML for PNG rasterization.
 */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ShareCardRenderer } from "../client/src/components/share-cards/HistoricalShareCard";
import { SHARE_CARD_LAYOUT_SIZE, type ShareCardModel } from "@shared/historicalShareCard";

const FALLBACK_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:#000;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}
.relative{position:relative}.absolute{position:absolute}
.inset-x-0{left:0;right:0}.top-0{top:0}
.pointer-events-none{pointer-events:none}
.w-full{width:100%}.h-full{height:100%}.min-h-0{min-height:0}
.h-1\\.5{height:.375rem}.h-8{height:2rem}.w-8{width:2rem}.h-10{height:2.5rem}.w-10{width:2.5rem}
.overflow-hidden{overflow:hidden}.overflow-x-auto{overflow-x:auto}
.rounded-2xl{border-radius:1rem}.rounded-md{border-radius:.375rem}.rounded-lg{border-radius:.5rem}.rounded-full{border-radius:9999px}
.border{border-width:1px;border-style:solid}
.text-left{text-align:left}.text-right{text-align:right}.text-center{text-align:center}
.shadow-\\[0_20px_60px_rgba\\(0\\,0\\,0\\,0\\.45\\)\\]{box-shadow:0 20px 60px rgba(0,0,0,.45)}
.flex{display:flex}.grid{display:grid}.inline-flex{display:inline-flex}
.flex-col{flex-direction:column}.flex-row-reverse{flex-direction:row-reverse}.flex-wrap{flex-wrap:wrap}
.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}.min-w-0{min-width:0}
.items-start{align-items:flex-start}.items-center{align-items:center}.justify-between{justify-content:space-between}.justify-center{justify-content:center}
.gap-1\\.5{gap:.375rem}.gap-2{gap:.5rem}.gap-2\\.5{gap:.625rem}.gap-3{gap:.75rem}
.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}
.grid-cols-\\[1fr_auto_1fr\\]{grid-template-columns:1fr auto 1fr}
.p-5{padding:1.25rem}.p-6{padding:1.5rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}
.px-2{padding-left:.5rem;padding-right:.5rem}.px-2\\.5{padding-left:.625rem;padding-right:.625rem}.py-0\\.5{padding-top:.125rem;padding-bottom:.125rem}
.mt-1{margin-top:.25rem}.mt-2{margin-top:.5rem}.mt-3{margin-top:.75rem}.mt-4{margin-top:1rem}.mt-5{margin-top:1.25rem}.ml-2{margin-left:.5rem}
.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.font-black{font-weight:900}.font-bold{font-weight:700}.font-semibold{font-weight:600}
.uppercase{text-transform:uppercase}.leading-tight{line-height:1.25}.tabular-nums{font-variant-numeric:tabular-nums}
.tracking-\\[0\\.12em\\]{letter-spacing:.12em}.tracking-\\[0\\.16em\\]{letter-spacing:.16em}
.tracking-\\[0\\.18em\\]{letter-spacing:.18em}.tracking-\\[0\\.2em\\]{letter-spacing:.2em}
.tracking-\\[0\\.22em\\]{letter-spacing:.22em}.tracking-\\[0\\.3em\\]{letter-spacing:.3em}
.text-\\[10px\\]{font-size:10px;line-height:1.3}.text-\\[11px\\]{font-size:11px;line-height:1.3}
.text-xs{font-size:.75rem;line-height:1.35}.text-sm{font-size:.875rem;line-height:1.4}
.text-base{font-size:1rem;line-height:1.5}.text-lg{font-size:1.125rem;line-height:1.4}
.text-xl{font-size:1.25rem;line-height:1.3}.text-2xl{font-size:1.5rem;line-height:1.25}
.text-3xl{font-size:1.875rem;line-height:1.2}.text-4xl{font-size:2.25rem;line-height:1.15}
.underline{text-decoration-line:underline}
.underline-offset-4{text-underline-offset:4px}
.decoration-\\[var\\(--ffr-share-accent\\)\\]{text-decoration-color:var(--ffr-share-accent)}
.object-contain{object-fit:contain}.object-cover{object-fit:cover}
.max-w-xl{max-width:36rem}
.max-w-\\[320px\\],.max-w-\\[420px\\],.max-w-\\[720px\\]{max-width:none}
@media (min-width:640px){
  .sm\\:p-6{padding:1.5rem}.sm\\:text-xl{font-size:1.25rem;line-height:1.3}
  .sm\\:text-base{font-size:1rem;line-height:1.5}.sm\\:text-3xl{font-size:1.875rem;line-height:1.2}
  .sm\\:text-4xl{font-size:2.25rem;line-height:1.15}.sm\\:text-5xl{font-size:3rem;line-height:1.1}
}
`;

function logoDataUri(): string {
  const dirs = [
    path.resolve(process.cwd(), "dist", "public", "logo.png"),
    path.resolve(process.cwd(), "client", "public", "logo.png"),
  ];
  for (const file of dirs) {
    if (fs.existsSync(file)) {
      return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
    }
  }
  return "/logo.png";
}

function readBuiltCss(): string {
  const dir = path.resolve(process.cwd(), "dist", "public", "assets");
  if (!fs.existsSync(dir)) return FALLBACK_CSS;
  const file = fs.readdirSync(dir).find((f) => f.endsWith(".css"));
  if (!file) return FALLBACK_CSS;
  try {
    return fs.readFileSync(path.join(dir, file), "utf8");
  } catch {
    return FALLBACK_CSS;
  }
}

export function buildShareCardExportHtml(model: ShareCardModel): string {
  const size = SHARE_CARD_LAYOUT_SIZE[model.layout];
  const markup = renderToStaticMarkup(createElement(ShareCardRenderer, { model }));
  const withLogo = markup.replace(/src="\/logo\.png"/g, `src="${logoDataUri()}"`);
  const css = readBuiltCss();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${size.width}, height=${size.height}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>${css}
  html,body{margin:0;padding:0;background:#000;width:${size.width}px;height:${size.height}px;overflow:hidden}
  [data-share-card-root]{max-width:none !important;width:${size.width}px !important;height:${size.height}px !important;aspect-ratio:auto !important;border-radius:0 !important}
  </style>
</head>
<body data-share-card-export>
${withLogo}
</body>
</html>`;
}
