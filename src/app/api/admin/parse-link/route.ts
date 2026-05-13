import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET — diagnostics
export async function GET() {
  return NextResponse.json({ ok: true, hasOpenAiKey: !!process.env.OPENAI_API_KEY });
}

function extractFromHtml(html: string) {
  // Extract post text
  const textMatch = html.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  let postText = '';
  if (textMatch) {
    postText = textMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?b>/gi, '**')
      .replace(/<\/?strong>/gi, '**')
      .replace(/<\/?i>/gi, '__')
      .replace(/<\/?em>/gi, '__')
      .replace(/<\/?s>/gi, '~~')
      .replace(/<\/?del>/gi, '~~')
      .replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  // Extract image
  const imgMatch = html.match(/background-image:\s*url\('([^']+)'\)/);
  const imageUrl = imgMatch ? imgMatch[1] : null;

  return { postText, imageUrl };
}

function basicParse(postText: string) {
  const lines = postText.split('\n').map(l => l.trim()).filter(Boolean);

  // Title = first meaningful line (strip markdown)
  const title = (lines[0] || 'Без названия').replace(/\*\*/g, '').replace(/__/g, '').replace(/~~/g, '').slice(0, 80);

  // Description = full text
  const description = postText;

  // Price — look for patterns like "5000₽", "5 000 руб", "цена: 3000", "стоимость 2000р"
  let price: number | null = null;
  let discountPrice: number | null = null;
  const pricePatterns = postText.match(/(\d[\d\s.,]*)\s*(?:₽|руб|р\b)/gi);
  if (pricePatterns) {
    const prices = pricePatterns.map(p => parseInt(p.replace(/[\s.,₽рубРУБ]/gi, ''), 10)).filter(n => n > 0 && n < 1000000);
    if (prices.length >= 2) {
      price = Math.max(...prices);
      discountPrice = Math.min(...prices);
      if (price === discountPrice) discountPrice = null;
    } else if (prices.length === 1) {
      price = prices[0];
    }
  }

  // Date — look for patterns like "15 мая", "15.05.2026", "15/05"
  let date: string | null = null;
  const months: Record<string, number> = {
    'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3, 'мая': 4, 'май': 4, 'июн': 5,
    'июл': 6, 'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11
  };
  const dateMatch = postText.match(/(\d{1,2})\s+(январ\S*|феврал\S*|март\S*|апрел\S*|ма[яй]\S*|июн\S*|июл\S*|август\S*|сентябр\S*|октябр\S*|ноябр\S*|декабр\S*)/i);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const monthKey = Object.keys(months).find(k => dateMatch[2].toLowerCase().startsWith(k));
    if (monthKey !== undefined) {
      const month = months[monthKey];
      const year = 2026;
      // Look for time
      const timeMatch = postText.match(/(\d{1,2})[:.:](\d{2})/);
      const h = timeMatch ? parseInt(timeMatch[1]) : 0;
      const m = timeMatch ? parseInt(timeMatch[2]) : 0;
      const d = new Date(year, month, day, h, m);
      date = d.toISOString().slice(0, 16);
    }
  }

  // Location — look for "адрес:", "место:", "📍", "ул.", "пр."
  let location: string | null = null;
  const locMatch = postText.match(/(?:📍|адрес[:\s]|место[:\s]|где[:\s])\s*([^\n]+)/i);
  if (locMatch) {
    location = locMatch[1].replace(/\*\*/g, '').replace(/__/g, '').trim();
  }

  return { title, description, price, discountPrice, date, location };
}

async function aiParse(postText: string, apiKey: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Ты извлекаешь информацию о мероприятии из текста Telegram-поста. Верни JSON:
- "title": короткое название мероприятия (до 60 символов)
- "description": полный текст поста, сохраняя разметку **жирный** __курсив__ ~~зачёркнутый~~
- "price": цена в рублях (число) или null
- "discountPrice": цена со скидкой (число) или null
- "date": дата ISO 8601 (YYYY-MM-DDTHH:mm) или null. Год 2026, сегодня ${new Date().toISOString().slice(0, 10)}
- "location": место/адрес или null`
        },
        { role: 'user', content: postText }
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // Auth
  let me: any = null;
  try {
    const { getSession } = await import('@/lib/admin-session');
    me = await getSession();
  } catch {}
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { url } = body;
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  try {
    let embedUrl = url.trim();
    if (!embedUrl.startsWith('http')) embedUrl = 'https://' + embedUrl;

    let u: URL;
    try { u = new URL(embedUrl); } catch {
      return NextResponse.json({ error: 'Невалидный URL' }, { status: 400 });
    }
    u.searchParams.set('embed', '1');

    const res = await fetch(u.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return NextResponse.json({ error: `Telegram вернул ${res.status}` }, { status: 400 });

    const html = await res.text();
    const { postText, imageUrl } = extractFromHtml(html);

    if (!postText) {
      return NextResponse.json({ error: 'Не удалось извлечь текст. Пост может быть приватным.' }, { status: 400 });
    }

    // Try AI first, fallback to basic parsing
    const apiKey = process.env.OPENAI_API_KEY;
    let parsed = apiKey ? await aiParse(postText, apiKey) : null;
    const usedAi = !!parsed;

    if (!parsed) {
      parsed = basicParse(postText);
    }

    return NextResponse.json({
      ...parsed,
      imageUrl,
      sourceUrl: url,
      method: usedAi ? 'ai' : 'basic',
    });
  } catch (err: any) {
    console.error('parse-link error:', err);
    return NextResponse.json({ error: err.message || 'Ошибка' }, { status: 500 });
  }
}
