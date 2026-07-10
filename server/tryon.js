/**
 * 图像合成（虚拟试穿）适配层
 *
 * 输入：clothesImage(dataURL) + personImage(dataURL) + prompt
 * 输出：{ imageUrl: '/generated/xxx.jpg', mock: bool, prompt }
 *
 * 真实模式：设置 ARK_API_KEY 后自动启用，走火山引擎 Ark Seedream 5.0 Pro。
 * 未设置 ARK_API_KEY 时走 mock（把 personImage 原样存盘回显，便于前端联调）。
 * 参考: D:\ai-makeup\src\lib\seedream.ts
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const TRYON_PROMPT = '将图一的服饰，穿到图二的人物身上，保持图二背景内容与人物面貌一致性不变。换装完成后，对人物的神态与姿态进行轻微调整，让其显得更自信从容（眼神稍坚定、嘴角略微上扬、姿态更挺拔），但幅度要小，不要改变面部特征、身份识别度、体型比例或背景。'

const ARK_API_BASE = process.env.ARK_API_BASE || 'https://ark.cn-beijing.volces.com/api/v3';
const ARK_MODEL = process.env.ARK_MODEL || 'doubao-seedream-5-0-pro-260628';
const ARK_SIZE = process.env.ARK_SIZE || '2K';

export async function tryon({ clothesImage, personImage, prompt, generatedDir }) {
  const usePrompt = prompt || TRYON_PROMPT;
  if (process.env.ARK_API_KEY) {
    return tryonReal({ clothesImage, personImage, prompt: usePrompt, generatedDir });
  }
  return mockTryon({ clothesImage, personImage, prompt: usePrompt, generatedDir });
}

/* ---------- 真实接入：Seedream 5.0 Pro on Volcengine Ark ---------- */
async function tryonReal({ clothesImage, personImage, prompt, generatedDir }) {
  const images = [clothesImage, personImage].filter(Boolean);
  if (!images.length) {
    return { imageUrl: null, mock: false, prompt, error: 'no image data' };
  }
  const body = {
    model: ARK_MODEL,
    prompt,
    image: images,
    size: ARK_SIZE,
    response_format: 'url',
    watermark: false,
  };
  const res = await fetch(`${ARK_API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Ark 请求失败 (${res.status})`);
  }
  const remoteUrl = data.data?.[0]?.url;
  if (!remoteUrl) throw new Error('Ark 未返回图片 URL');
  // 下载并落盘，前端拿本地 URL 避免跨域和防盗链
  const imgResp = await fetch(remoteUrl);
  if (!imgResp.ok) throw new Error(`下载生成图失败 (${imgResp.status})`);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  await mkdir(generatedDir, { recursive: true });
  const filename = `${randomUUID().slice(0, 8)}.jpg`;
  await writeFile(join(generatedDir, filename), buf);
  return {
    imageUrl: `/generated/${filename}`,
    mock: false,
    prompt,
    remoteUrl,
    model: ARK_MODEL,
  };
}

/* ---------- mock：把 personImage 原样存盘 + 返回 URL，便于前端联调 ---------- */
async function mockTryon({ clothesImage, personImage, prompt, generatedDir }) {
  const clothesBuf = dataUrlToBuffer(clothesImage);
  const personBuf = dataUrlToBuffer(personImage);
  const echo = personBuf || clothesBuf;
  if (!echo) {
    return { imageUrl: null, mock: true, prompt, error: 'no image data' };
  }
  await mkdir(generatedDir, { recursive: true });
  const id = randomUUID().slice(0, 8);
  const filename = `${id}.jpg`;
  await writeFile(join(generatedDir, filename), echo);
  return {
    imageUrl: `/generated/${filename}`,
    mock: true,
    prompt,
    clothesBytes: clothesBuf?.length || 0,
    personBytes: personBuf?.length || 0,
  };
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const idx = dataUrl.indexOf(',');
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  try { return Buffer.from(b64, 'base64'); } catch { return null; }
}
