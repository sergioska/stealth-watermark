import * as fs from "fs";
import { addWatermark, extractWatermark } from "../src/watermark";
//import { addWatermark as addWatermarkDwtDct, extractWatermark as extractWatermarkDwtDct } from "../src/watermark-dwt-dct";
import { WatermarkOptions, WatermarkResult } from "../src/types";

(async () => {
  process.on("unhandledRejection", (e) => {
    console.error("UNHANDLED REJECTION:", e);
    process.exit(1);
  });

  console.log("Inizio test");

  const images = [
    "demo/swr3-original.jpeg",
  ]

  for (const inputPath of images) {

    //const inputPath = "demo/orange.jpeg";
    if (!fs.existsSync(inputPath)) {
      console.error(`File non trovato: ${inputPath}`);
      process.exit(1);
    }

    const original = fs.readFileSync(inputPath);
    //console.log("original", original);

    const wmText = "il mio watermark invisibile";
    const opts: WatermarkOptions = { q: 26, channel: 2, seed: 1234, reps: 256, bands: "HL" } 
    //console.log("opts", opts);

    try {
      //console.time("addWatermark");
      //console.log("addWatermark");
      const { image } = await addWatermark(original, wmText, opts as WatermarkOptions) as unknown as WatermarkResult;
      //console.log("addWatermark done");
      //console.timeEnd("addWatermark");

      fs.writeFileSync("demo/watermarked.jpeg", image);
      //console.log("Watermark aggiunto -> watermarked.png");

      const savedImage = fs.readFileSync("demo/watermarked.jpeg");

      //console.time("extractWatermark");
      const extracted = await extractWatermark(savedImage, opts);
      //console.timeEnd("extractWatermark");

      const check = extracted === "il mio watermark invisibile";

      const emojy = check ? "✅" : "❌";
      console.log(`${inputPath} -> ${JSON.stringify(extracted)} ${emojy}`);
    } catch (err) {
      console.error("Errore nel test:", err);
    }
  }
})();