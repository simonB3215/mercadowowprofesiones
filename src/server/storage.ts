/**
 * Conservación del archivo original de cada ingesta (sección 3, paso 1).
 * - Con SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: bucket privado de Supabase Storage.
 * - En local (fuera de Vercel): carpeta data/raw.
 * - Si no hay ninguno disponible, solo se registra el checksum.
 */
import fs from 'node:fs';
import path from 'node:path';

const BUCKET = process.env.SUPABASE_RAW_BUCKET ?? 'tsm-raw';

export async function storeRaw(key: string, text: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && service) {
    const put = () =>
      fetch(`${url}/storage/v1/object/${BUCKET}/${key}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${service}`, apikey: service, 'content-type': 'text/csv', 'x-upsert': 'true' },
        body: text,
      });
    let res = await put();
    if (res.status === 404 || res.status === 400) {
      await fetch(`${url}/storage/v1/bucket`, {
        method: 'POST',
        headers: { authorization: `Bearer ${service}`, apikey: service, 'content-type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
      });
      res = await put();
    }
    if (!res.ok) throw new Error(`Storage HTTP ${res.status}`);
    return `supabase://${BUCKET}/${key}`;
  }
  if (!process.env.VERCEL) {
    const file = path.resolve('data/raw', key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  }
  return null;
}
