/**
 * 代理后端：转发新浪/腾讯股票接口，解决 CORS 与 GBK 编码
 * 接口逻辑参考 leek-fund
 */
import express from "express";
import axios from "axios";
import iconv from "iconv-lite";
import { parseSinaStockResponse, parseTencentHKResponse } from "./parser.ts";

const { decode } = iconv;

const app = express();
const PORT = 3001;

app.use(express.json());
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  next();
});

const randHeader = () => ({
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "http://finance.sina.com.cn/",
});

// 股票行情：新浪（A股、美股、期货）
app.get("/api/stock", async (req, res) => {
  const codes = String(req.query.codes || "")
    .split(",")
    .filter(Boolean);
  if (!codes.length) return res.json([]);
  const url = `https://hq.sinajs.cn/list=${codes
    .map((c) => c.replace(".", "$"))
    .join(",")}`;
  try {
    const resp = await axios.get(url, {
      responseType: "arraybuffer",
      headers: randHeader(),
    });
    const body = decode(Buffer.from(resp.data), "GB18030");
    const list = parseSinaStockResponse(body, codes);
    res.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/stock", message);
    res.status(500).json({ error: message });
  }
});

// 港股行情：腾讯
app.get("/api/hk", async (req, res) => {
  const codes = String(req.query.codes || "")
    .split(",")
    .filter(Boolean);
  if (!codes.length) return res.json([]);
  const q = codes.map((c) => `r_${c}`).join(",");
  const url = "https://qt.gtimg.cn/q=";
  try {
    const resp = await axios.get(url, {
      params: { q, fmt: "json" },
      responseType: "arraybuffer",
    });
    const body = decode(Buffer.from(resp.data), "GBK");
    const data = JSON.parse(body);
    const list = parseTencentHKResponse(data, codes);
    res.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/hk", message);
    res.status(500).json({ error: message });
  }
});

// 搜索股票/指数：腾讯
app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "");
  if (!q.trim()) return res.json([]);
  const url =
    "https://proxy.finance.qq.com/ifzqgtimg/appstock/smartbox/search/get";
  try {
    const resp = await axios.get(url, { params: { q } });
    const arr = resp.data?.data?.stock || [];
    const list = arr.map((item: string[]) => ({
      code: (item[1] || "").toLowerCase(),
      name: item[2] || "",
      market: item[0] || "",
      abbreviation: item[3] || "",
      label: `${(item[0] || "")}${(item[1] || "").toLowerCase()} | ${
        item[2] || ""
      }`,
    }));
    res.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/search", message);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Stock API proxy: http://localhost:${PORT}`);
});
