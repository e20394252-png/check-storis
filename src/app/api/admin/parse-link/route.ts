import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET — quick check that route exists and key is set
export async function GET() {
  const hasKey = !!process.env.OPENAI_API_KEY;
  return NextResponse.json({ ok: true, hasOpenAiKey: hasKey });
}

export async function POST(req: NextRequest) {
  // Auth check — inline to avoid cookie issues crashing
  let me: any = null;
  try {
    const { getSession } = await import('@/lib/admin-session');
    me = await getSession();
  } catch (e: any) {
    console.error('Session error:', e.message);
  }
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url } = body;
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  try {
    // Normalize URL
    let embedUrl = url.trim();
    if (!embedUrl.startsWith('http')) embedUrl = 'https://' + embedUrl;

    let u: URL;
    try {
      u = new URL(embedUrl);
    } catch {
      return NextResponse.json({ error: 'Невалидный URL' }, { status: 400 });
    }
    u.searchParams.set('embed', '1');

    // Fetch Telegram embed page
    const res = await fetch(u.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Telegram вернул ${res.status}` }, { status: 400 });
    }
    const html = await res.text();

    // Extract post text from embed HTML
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

    // Extract image URL from embed
    const imgMatch = html.match(/background-image:\s*url\('([^']+)'\)/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    if (!postText) {
      return NextResponse.json({
        error: 'Не удалось извлечь текст из поста. Возможно, пост приватный.',
        debug: { htmlLength: html.length, hasText: !!textMatch }
      }, { status: 400 });
    }

    // Call OpenAI gpt-4o-mini
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY не настроен в Railway Variables' }, { status: 500 });
    }

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `Ты извлекаешь информацию о мероприятии из текста Telegram-поста. Верни JSON со следующими полями:
- "title": короткое название мероприятия (до 60 символов)
- "description": полный текст поста, сохраняя разметку **жирный** __курсив__ ~~зачёркнутый~~
- "price": цена в рублях (только число) или null если не указана
- "discountPrice": цена со скидкой (число) или null
- "date": дата и время в формате ISO 8601 (YYYY-MM-DDTHH:mm) или null. Сегодня ${new Date().toISOString().slice(0, 10)}, год 2026
- "location": место проведения/адрес или null`
          },
          { role: 'user', content: postText }
        ],
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('OpenAI error:', aiRes.status, errText);
      return NextResponse.json({ error: `OpenAI ошибка: ${aiRes.status}` }, { status: 500 });
    }

    const aiData = await aiRes.json();

    let parsed: any;
    try {
      parsed = JSON.parse(aiData.choices[0].message.content);
    } catch {
      return NextResponse.json({ error: 'AI вернул невалидный JSON', raw: aiData.choices[0].message.content }, { status: 500 });
    }

    return NextResponse.json({
      ...parsed,
      imageUrl,
      sourceUrl: url,
    });
  } catch (err: any) {
    console.error('parse-link error:', err);
    return NextResponse.json({ error: err.message || 'Неизвестная ошибка' }, { status: 500 });
  }
}
