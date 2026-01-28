# Vue Stock Viewer

基于 [leek-fund](https://github.com/LeekHub/leek-fund) 使用的**新浪 / 腾讯**股票接口，实现的 Vue 3 股票行情查询与可视化页面。

## 功能

- **搜索**：关键词搜索 A 股 / 港股 / 美股（腾讯智能框接口）
- **自选**：添加/移除自选，列表持久化到 localStorage
- **行情**：A 股、美股、国内/海外期货（新浪）；港股（腾讯）
- **表格**：最新价、涨跌幅、今开、最高、最低、成交量等

## 技术栈

- Vue 3 + TypeScript + Vite
- 后端代理：Express，解决 CORS 与 GBK/GB18030 解码
- 接口与解析逻辑参考 leek-fund

## 接口说明

| 数据类型     | 来源   | 接口 |
|-------------|--------|------|
| A股/美股/期货 | 新浪   | `https://hq.sinajs.cn/list={codes}` |
| 港股         | 腾讯   | `https://qt.gtimg.cn/q=` |
| 搜索         | 腾讯   | `https://proxy.finance.qq.com/ifzqgtimg/appstock/smartbox/search/get?q=` |

## 开发

```bash
# 安装依赖
npm install

# 同时启动后端代理(3001) + 前端(5173)
npm run dev
```

浏览器访问：http://localhost:5173

- 前端请求 `/api/*` 会被 Vite 代理到 `http://localhost:3001`
- 后端负责请求新浪/腾讯并解码 GBK/GB18030，返回 JSON

## 构建

```bash
npm run build
npm run preview   # 预览构建结果（需单独运行后端）
```

生产环境需自行部署后端（如 `node server/index.js`）并配置 Nginx 将 `/api` 转发到该服务。

## 项目结构

```
vue-stock-viewer/
├── server/           # 代理后端
│   ├── index.js      # Express 路由：/api/stock, /api/hk, /api/search
│   └── parser.js     # 新浪/腾讯响应解析
├── src/
│   ├── api/stock.ts  # 前端请求封装
│   ├── components/   # StockSearch, StockTable
│   ├── types/stock.ts
│   └── App.vue
├── vite.config.ts    # proxy /api -> localhost:3001
└── package.json
```

## License

MIT
