import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshData } from './scripts/refresh-data.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
let refreshing = false;

app.use(express.static(path.join(root, 'public')));
app.post('/api/refresh', async (_request, response) => {
  if (refreshing) return response.status(409).json({ error: '이미 갱신 중입니다.' });
  refreshing = true;
  try {
    const data = await refreshData();
    response.json(data);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message });
  } finally {
    refreshing = false;
  }
});

const port = Number(process.env.PORT || 4173);
app.listen(port, '127.0.0.1', () => console.log(`든든전세 지도: http://127.0.0.1:${port}`));
