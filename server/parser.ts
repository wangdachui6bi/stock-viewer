/**
 * 解析新浪 / 腾讯股票接口返回数据（逻辑参考 leek-fund）
 */

type StockItem = {
  code: string;
  name: string;
  type: string;
  symbol?: string;
  open?: string;
  yestclose?: string;
  price?: string;
  high?: string;
  low?: string;
  volume?: string;
  amount?: string;
  time?: string;
  updown?: string;
  percent: string;
};

function calcFixedPriceNumber(
  open = "0",
  yestclose = "0",
  price = "0",
  high = "0",
  low = "0",
) {
  const reg = /0+$/g;
  open = (open && open.replace && open.replace(reg, "")) || "0";
  yestclose = (yestclose && yestclose.replace && yestclose.replace(reg, "")) || "0";
  price = (price && price.replace && price.replace(reg, "")) || "0";
  high = (high && high.replace && high.replace(reg, "")) || "0";
  low = (low && low.replace && low.replace(reg, "")) || "0";
  let o = open.indexOf(".") === -1 ? 0 : open.length - open.indexOf(".") - 1;
  let yc =
    yestclose.indexOf(".") === -1
      ? 0
      : yestclose.length - yestclose.indexOf(".") - 1;
  let p = price.indexOf(".") === -1 ? 0 : price.length - price.indexOf(".") - 1;
  let h = high.indexOf(".") === -1 ? 0 : high.length - high.indexOf(".") - 1;
  let l = low.indexOf(".") === -1 ? 0 : low.length - low.indexOf(".") - 1;
  let max = Math.max(o, yc, p, h, l);
  if (max > 3) max = 2;
  return max;
}

function formatNum(val = 0, fixed = 2, format = false) {
  const num = +val;
  if (format) {
    if (num > 1000 * 10000) return (num / (10000 * 10000)).toFixed(fixed) + "亿";
    if (num > 1000) return (num / 10000).toFixed(fixed) + "万";
  }
  return num.toFixed(fixed);
}

/**
 * 解析新浪 hq.sinajs.cn 返回的文本
 */
function parseSinaStockResponse(body: string, codes: string[]): StockItem[] {
  const list: StockItem[] = [];
  if (/FAILED/.test(body)) return list;

  const splitData = body.split('";\n');
  for (let i = 0; i < splitData.length - 1; i++) {
    let code = splitData[i].split('="')[0].split("var hq_str_")[1];
    if (!code) continue;
    if (code.includes("$")) code = code.replace(/\$/g, ".");
    const params = splitData[i].split('="')[1]?.split(",");
    if (!params || params.length <= 1) {
      list.push({ code, name: `无数据 ${code}`, type: "nodata", percent: "" });
      continue;
    }

    const type = code.substr(0, 2) || "sh";
    const symbol = code.substr(2);
    let item: StockItem | null = null;
    let fixedNumber = 2;

    if (/^(sh|sz|bj)/.test(code)) {
      // A股
      let open = params[1],
        yestclose = params[2],
        price = params[3];
      if (Number(price) === 0)
        price = Number(params[6]) !== 0 ? params[6] : yestclose;
      const high = params[4],
        low = params[5];
      fixedNumber = calcFixedPriceNumber(open, yestclose, price, high, low);
      const updown = +price - +yestclose;
      const percent = ((Math.abs(updown) / +yestclose) * 100).toFixed(2);
      item = {
        code,
        name: params[0],
        open: formatNum(open, fixedNumber, false),
        yestclose: formatNum(yestclose, fixedNumber, false),
        price: formatNum(price, fixedNumber, false),
        high: formatNum(high, fixedNumber, false),
        low: formatNum(low, fixedNumber, false),
        volume: formatNum(params[8], 2, true),
        amount: formatNum(params[9], 2, true),
        time: `${params[30] || ""} ${params[31] || ""}`.trim(),
        updown: formatNum(updown, fixedNumber, false),
        percent: (updown >= 0 ? "+" : "") + percent,
        type: "a",
        symbol,
      };
    } else if (/^usr_/.test(code)) {
      // 美股
      const symbolUs = code.substr(4);
      let open = params[5],
        yestclose = params[26],
        price = params[1];
      const high = params[6],
        low = params[7];
      fixedNumber = calcFixedPriceNumber(open, yestclose, price, high, low);
      const updown = +price - +yestclose;
      const percent = ((Math.abs(updown) / +yestclose) * 100).toFixed(2);
      item = {
        code,
        name: params[0],
        open: formatNum(open, fixedNumber, false),
        yestclose: formatNum(yestclose, fixedNumber, false),
        price: formatNum(price, fixedNumber, false),
        high: formatNum(high, fixedNumber, false),
        low: formatNum(low, fixedNumber, false),
        volume: formatNum(params[10], 2, true),
        amount: "—",
        time: params[3] || "",
        updown: formatNum(updown, fixedNumber, false),
        percent: (updown >= 0 ? "+" : "") + percent,
        type: "us",
        symbol: symbolUs,
      };
    } else if (/nf_/.test(code)) {
      // 国内期货
      let name = params[0],
        open = params[2],
        high = params[3],
        low = params[4];
      let price = params[8],
        yestclose = params[8 + 2],
        volume = params[8 + 6];
      const stockIndexFuture =
        /nf_IC|nf_IF|nf_IH|nf_IM|nf_TF|nf_TS|nf_T\d+|nf_TL/.test(code);
      if (stockIndexFuture) {
        name = (params[49] || "").slice(0, -1).replace(/"/g, "");
        open = params[0];
        high = params[1];
        low = params[2];
        price = params[3];
        volume = params[4];
        yestclose = params[13];
      }
      fixedNumber = calcFixedPriceNumber(open, yestclose, price, high, low);
      const updown = +price - +yestclose;
      const percent = (+yestclose ? (Math.abs(updown) / +yestclose) * 100 : 0).toFixed(2);
      item = {
        code,
        name,
        open: formatNum(open, fixedNumber, false),
        yestclose: formatNum(yestclose, fixedNumber, false),
        price: formatNum(price, fixedNumber, false),
        high: formatNum(high, fixedNumber, false),
        low: formatNum(low, fixedNumber, false),
        volume: formatNum(volume, 2, true),
        amount: "—",
        time: "",
        updown: formatNum(updown, fixedNumber, false),
        percent: (updown >= 0 ? "+" : "") + percent,
        type: "nf",
        symbol: code.replace("nf_", ""),
      };
    } else if (/hf_/.test(code)) {
      // 海外期货
      let price = params[0];
      if (Number(price) > Number(params[3]) || Number(price) < Number(params[2]))
        price = params[2];
      let name = (params[13] || "").endsWith('"')
        ? params[13].slice(0, -1)
        : params[13] || "";
      const open = params[8],
        high = params[4],
        low = params[5],
        yestclose = params[7];
      let volume = params.length >= 15 ? (params[14] || "").slice(0, -1) : 0;
      fixedNumber = calcFixedPriceNumber(open, yestclose, price, high, low);
      const updown = +price - +yestclose;
      const percent = (+yestclose ? (Math.abs(updown) / +yestclose) * 100 : 0).toFixed(2);
      item = {
        code,
        name,
        open: formatNum(open, fixedNumber, false),
        yestclose: formatNum(yestclose, fixedNumber, false),
        price: formatNum(price, fixedNumber, false),
        high: formatNum(high, fixedNumber, false),
        low: formatNum(low, fixedNumber, false),
        volume: formatNum(volume, 2, true),
        amount: "—",
        time: `${params[12] || ""} ${params[6] || ""}`.trim(),
        updown: formatNum(updown, fixedNumber, false),
        percent: (updown >= 0 ? "+" : "") + percent,
        type: "hf",
        symbol: code.replace("hf_", ""),
      };
    }

    if (item) list.push(item);
    else list.push({ code, name: params[0] || code, type: "nodata", percent: "" });
  }
  return list;
}

/**
 * 解析腾讯港股接口返回的 JSON
 */
function parseTencentHKResponse(data: Record<string, any>, codes: string[]): StockItem[] {
  return codes.map((code) => {
    const codeKey = `r_${code}`;
    const arr = data[codeKey];
    const codeNorm = code.startsWith("hk")
      ? "hk" + code.substring(2).toLowerCase()
      : code.toLowerCase();
    if (!arr) return { code: codeNorm, name: "NODATA", type: "nodata", percent: "" };
    const price = arr[3],
      yestclose = arr[4],
      open = arr[5];
    const high = arr[33],
      low = arr[34];
    const fixedNumber = calcFixedPriceNumber(open, yestclose, price, high, low);
    const updown = +price - +yestclose;
    const percent = (+yestclose ? (Math.abs(updown) / +yestclose) * 100 : 0).toFixed(2);
    return {
      code: codeNorm,
      name: arr[1],
      open: formatNum(open, fixedNumber, false),
      yestclose: formatNum(yestclose, fixedNumber, false),
      price: formatNum(price, fixedNumber, false),
      high: formatNum(high, fixedNumber, false),
      low: formatNum(low, fixedNumber, false),
      volume: formatNum(arr[36] || 0, 2, true),
      amount: formatNum(arr[37] || 0, 2, true),
      time: arr[30] || "",
      updown: formatNum(updown, fixedNumber, false),
      percent: (updown >= 0 ? "+" : "") + percent,
      type: "hk",
      symbol: codeNorm.replace("hk", ""),
    };
  });
}

export { parseSinaStockResponse, parseTencentHKResponse };
