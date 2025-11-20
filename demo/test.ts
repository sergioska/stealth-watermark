import * as fs from "fs";
import { addWatermark, extractWatermark } from "../src/watermark";
import { WatermarkOptions } from "../src/types";

(async () => {
  process.on("unhandledRejection", (e) => {
    console.error("UNHANDLED REJECTION:", e);
    process.exit(1);
  });

  // === Nuovo: lettura percorso da CLI ===
  const cliArg = process.argv[2];

  if (cliArg === "--help" || cliArg === "-h") {
    console.log("Uso: node test.js <percorso-immagine>");
    console.log("Esempio: node test.js ./demo/input2.jpeg");
    process.exit(0);
  }

  const inputPath = cliArg || "demo/input.jpeg";
  console.log("Input path:", inputPath);

  if (!fs.existsSync(inputPath)) {
    console.error(`File non trovato: ${inputPath}`);
    process.exit(1);
  }

  console.log("Inizio test");

  const original = fs.readFileSync(inputPath);
  console.log("original", original);

  const wmText = "il mio watermark invisibile";
  const opts: WatermarkOptions = { q: 22, channel: 1, seed: 1234, reps: 5 };
  console.log("opts", opts);

  try {
    console.time("addWatermark");
    console.log("addWatermark");
    const { image } = await addWatermark(original, wmText, opts);
    console.log("addWatermark done");
    console.timeEnd("addWatermark");

    const outputWatermarked = "demo/watermarked.jpeg";
    fs.writeFileSync(outputWatermarked, image);
    console.log("Watermark aggiunto ->", outputWatermarked);

    const savedImage = fs.readFileSync(outputWatermarked);

    console.time("extractWatermark");
    const extracted = await extractWatermark(savedImage, opts);
    console.timeEnd("extractWatermark");

    console.log("Watermark estratto:", JSON.stringify(extracted));
  } catch (err) {
    console.error("Errore nel test:", err);
  }
})();
