/**
 * AI·衣境 v5 — Express mock 后端
 * 所有 AI/数据接口先返回 mock，与 v4 硬编码保持一致，便于前端逐步接入。
 * 后续每个 route 内部有 TODO 标注真实 provider 的接入点。
 */
import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tryon, TRYON_PROMPT } from './tryon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GEN_DIR = join(ROOT, 'data', 'generated');

const app = express();
app.use(express.json({ limit: '20mb' }));

/* ---------- 静态前端 ---------- */
app.use(express.static(join(ROOT, 'public')));
/* ---------- 生成图静态服务 ---------- */
app.use('/generated', express.static(GEN_DIR, { fallthrough: false }));

/* ---------- 内存态（demo 用；生产接 Redis） ---------- */
const sessions = new Map();
const savedLooks = new Map();

/* ---------- ① Session ---------- */
app.post('/api/session', (req, res) => {
  const id = randomUUID();
  sessions.set(id, { createdAt: Date.now(), analysis: null, answers: {}, picked: [], outfits: null });
  res.json({ sessionId: id });
});

/* ---------- ② 图像分析 ---------- */
// TODO: 接商汤 / Face++ / 自建 VLM。当前 mock；已能接收前端 base64 图像。
app.post('/api/analyze-image', (req, res) => {
  const { sessionId, image } = req.body || {};
  const imageBytes = typeof image === 'string' && image.startsWith('data:')
    ? Math.round((image.length - image.indexOf(',') - 1) * 3 / 4)
    : 0;
  console.log(`[analyze] session=${sessionId?.slice(0, 8) || 'n/a'} image=${imageBytes ? (imageBytes / 1024).toFixed(1) + 'KB' : 'none'}`);
  const analysis = {
    face: { shape: '鹅蛋脸', symmetry: 0.92, features: '五官舒展，眉眼间距从容' },
    body: { proportion: '匀称', shoulder: '线条流畅', posture: '松弛挺拔' },
    temperament: { keywords: ['温润', '含蓄', '有力量'], tone: '暖调' },
    receivedImage: imageBytes > 0,
  };
  if (sessions.has(sessionId)) sessions.get(sessionId).analysis = analysis;
  setTimeout(() => res.json({ analysis }), 300);
});

/* ---------- ③ 报告文案 ---------- */
// 演示阶段：无论输入，固定返回下列 4 段。真实接入时，把 analysis 传给 LLM 即可。
app.post('/api/report', (req, res) => {
  const segments = [
    '您的面部轮廓偏柔和，戴着一副眼镜，给人一种知性稳重的感觉。眉眼比较协调，整体显得很有精神。',
    '身姿比较挺拔，站在那里很自然放松。整体比例比较匀称，仪态大方得体。',
    '肤色状态不错，透着健康的光泽。整体形象给人感觉沉稳干练，气质很不错。',
    '根据您的整体形象分析，也许您可以尝试偏知性一点，或者干练一点的服饰搭配。接下来，您可以选择我们的门店专属搭配顾问，由AI根据您的形象为您推荐造型方案；如果您有中意的款式或想自己挑选搭配，也可以选择自由搭配方式进行穿搭体验。您可以试试大地色系或中性色的搭配，应该会和您的整体气质很搭。',
  ];
  res.json({ segments });
});

/* ---------- ④ 顾问偏好问题 ---------- */
app.get('/api/questions', (_req, res) => {
  res.json({
    questions: [
      { q: '您今天，主要是什么场合？', key: 'occasion', opts: ['聚会', '商务', '约会', '都可以'] },
      { q: '您偏好，哪种风格？',       key: 'style',    opts: ['简约', '优雅', '休闲', '复古', '前卫', '都可以'] },
      { q: '有什么，是您不喜欢的？',   key: 'avoid',    opts: ['不穿短裙', '不要亮色', '不要动物纹理', '没有'] },
    ],
  });
});

/* ---------- ⑤ 商品目录 ---------- */
app.get('/api/garments', async (req, res) => {
  const raw = await readFile(join(ROOT, 'data', 'garments.json'), 'utf8');
  const all = JSON.parse(raw);
  const { style } = req.query;
  const list = !style || style === 'all' ? all : all.filter(g => g.style === style);
  res.json({ garments: list });
});

/* ---------- ⑥ 反扫：识别实物商品 ---------- */
// TODO: 接门店 RFID / NFC / 图像识别中台。当前随机返回一件。
app.post('/api/scan', async (req, res) => {
  const raw = await readFile(join(ROOT, 'data', 'garments.json'), 'utf8');
  const all = JSON.parse(raw);
  const { excludeIds = [] } = req.body || {};
  const pool = all.filter(g => !excludeIds.includes(g.id));
  const g = pool[Math.floor(pool.length * (Date.now() % 1000) / 1000)] || pool[0];
  res.json({ garment: g });
});

/* ---------- ⑦ 生成穿搭方案 ---------- */
// 通用兜底：返 v4 硬编码 3 套（用于自由搭配 / 无图像场景）。
app.post('/api/outfit/generate', (req, res) => {
  const { sessionId } = req.body || {};
  const outfits = [
    { id: 'o1', title: '秋日呢子大衣',   style: '韩式 · 莫兰迪',  color1: '#E7D4C5', color2: '#C9A88A' },
    { id: 'o2', title: '丝缎晚装套装',   style: '优雅 · 暮光玫瑰', color1: '#E8CFC4', color2: '#B86A55' },
    { id: 'o3', title: '廓形针织造型',   style: '简约 · 暖陶土',  color1: '#D9C7B2', color2: '#9A7B52' },
  ];
  if (sessions.has(sessionId)) sessions.get(sessionId).outfits = outfits;
  setTimeout(() => res.json({ outfits }), 500);
});

/* ---------- 图像合成（虚拟试穿）单张 ---------- */
// POST /api/tryon  body: { clothesImage, personImage, prompt? }
app.post('/api/tryon', async (req, res) => {
  const { clothesImage, personImage, prompt } = req.body || {};
  try {
    const r = await tryon({
      clothesImage, personImage,
      prompt: prompt || TRYON_PROMPT,
      generatedDir: GEN_DIR,
    });
    res.json(r);
  } catch (err) {
    console.error('[tryon] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ---------- 顾问 3 套（固定） ---------- */
// POST /api/advisor/generate  body: { sessionId, personImage }
// 服务端读取 data/looks/advisor.json 的 3 套 metadata，取对应 clothes 图，逐一与 personImage 合成。
app.post('/api/advisor/generate', async (req, res) => {
  const { sessionId, personImage } = req.body || {};
  let looks = [];
  try {
    looks = JSON.parse(await readFile(join(ROOT, 'data', 'looks', 'advisor.json'), 'utf8'));
  } catch (err) {
    return res.status(500).json({ error: 'advisor manifest missing: ' + err.message });
  }
  const outfits = await Promise.all(looks.map(async (look) => {
    const clothesImage = await readImageAsDataUrl(join(ROOT, 'data', 'looks', look.clothes)).catch(() => null);
    if (!clothesImage) {
      console.warn(`[advisor] missing clothes file: ${look.clothes}`);
    }
    const r = await tryon({
      clothesImage, personImage,
      prompt: TRYON_PROMPT,
      generatedDir: GEN_DIR,
    }).catch(err => ({ imageUrl: null, error: err.message }));
    return { ...look, imageUrl: r.imageUrl, mock: r.mock, error: r.error || null };
  }));
  if (sessions.has(sessionId)) sessions.get(sessionId).outfits = outfits;
  console.log(`[advisor] session=${sessionId?.slice(0, 8) || 'n/a'} generated=${outfits.filter(o => o.imageUrl).length}/${outfits.length}`);
  res.json({ outfits, prompt: TRYON_PROMPT });
});

async function readImageAsDataUrl(path) {
  const buf = await readFile(path);
  const ext = path.split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/* ---------- ⑨ 保存造型 → 短链 + 二维码目标 ---------- */
app.post('/api/save-look', (req, res) => {
  const { sessionId, outfitIds = [] } = req.body || {};
  const id = randomUUID().slice(0, 8);
  savedLooks.set(id, { sessionId, outfitIds, createdAt: Date.now() });
  const shareUrl = `${req.protocol}://${req.get('host')}/look/${id}`;
  res.json({ lookId: id, shareUrl });
});

/* ---------- ⑩ H5 分享页 ---------- */
app.get('/look/:id', (req, res) => {
  const look = savedLooks.get(req.params.id);
  if (!look) return res.status(404).send('Look not found');
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>您的专属造型</title>
<style>body{margin:0;font-family:system-ui,'Noto Sans SC',sans-serif;background:#F7F1EA;color:#2A231F;padding:40px 24px;text-align:center}
h1{font-weight:400;font-size:22px;margin:0 0 8px}p{color:#6B5F56;font-size:14px}</style>
<h1>您的专属造型</h1><p>Look ID · ${req.params.id}</p><p>共 ${look.outfitIds.length} 套方案 · TODO 渲染实际图片</p>`);
});

/* ---------- 启动 ---------- */
const PORT = process.env.PORT || 5180;
app.listen(PORT, () => {
  console.log(`[v5] http://localhost:${PORT}`);
});
