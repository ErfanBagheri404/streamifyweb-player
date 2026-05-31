import express from "express";
import cors from "cors";
import { searchJioSaavn } from "./lib/search/jiosaavn";
import { searchSoundCloud } from "./lib/search/soundcloud";
import { searchYouTube } from "./lib/search/youtube";
import { searchYouTubeMusic } from "./lib/search/youtubemusic";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:3000" }));

app.get("/search", async (req, res) => {
  const { q, source, filter, page, limit, nextpage } = req.query;

  if (!q || typeof q !== "string") {
    return res.status(400).json({ items: [], nextpage: null });
  }

  const sourceParam = typeof source === "string" ? source : "youtube";
  const filterParam = typeof filter === "string" ? filter : "all";
  const pageNum = Number.parseInt(String(page ?? "1"), 10) || 1;
  const limitNum = Number.parseInt(String(limit ?? "20"), 10) || 20;
  const nextpageToken = typeof nextpage === "string" ? nextpage : undefined;

  try {
    switch (sourceParam) {
      case "youtube":
      case "invidious": {
        const result = await searchYouTube(
          q,
          filterParam,
          pageNum,
          limitNum,
          nextpageToken
        );
        return res.json({ items: result.items, nextpage: result.nextpage ?? null });
      }
      case "youtubemusic": {
        const result = await searchYouTubeMusic(
          q,
          filterParam,
          pageNum,
          limitNum,
          nextpageToken
        );
        return res.json({ items: result.items, nextpage: result.nextpage ?? null });
      }
      case "soundcloud": {
        const result = await searchSoundCloud(q, filterParam, pageNum, limitNum);
        return res.json({ items: result.items, nextpage: result.nextpage ?? null });
      }
      case "jiosaavn": {
        const result = await searchJioSaavn(q);
        return res.json({ items: result.items, nextpage: result.nextpage ?? null });
      }
      default:
        return res.json({ items: [], nextpage: null });
    }
  } catch (error) {
    console.error("[EXPRESS /search] Search failed:", error);
    return res.status(500).json({ items: [], nextpage: null, error: "Search failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});
