import Anthropic from '@anthropic-ai/sdk';

const PROMPT = `You are extracting structured data from a bill, receipt, paystub, brokerage statement, or credit-card statement image.

Return ONLY a JSON object matching this schema, with no surrounding prose:
{
  "vendor": string | null,
  "month": string | null,
  "items": [
    {
      "description": string,
      "amount": number,
      "date": string | null
    }
  ]
}

Rules:
- Extract every line-item that moves money in or out, including refunds, credits, deposits, and paycheck deductions.
- Amounts:
  - Purchases / outflows / deductions: positive (e.g., 84.20)
  - Refunds / credits / returns: NEGATIVE (e.g., -40.00)
  - Income (deposits, paycheck gross, dividends, interest, Zelle): positive
- For paystubs: extract gross pay as one positive line, then each deduction (federal tax, state tax, FICA, 401k, Roth, insurance, etc.) as a positive line using the deduction name as description. Use the current-period column, not YTD.
- For brokerage statements: extract dividends, interest, distributions as positive lines. SKIP buy/sell trades.
- For credit-card statements: each transaction is one item. Refunds / returns / credits → negative amount. Skip "PAYMENT - THANK YOU" lines (those are the user's payment to the card issuer, not a transaction).
- Always skip: statement totals/balances, sales-tax breakdown lines on single receipts, account-number headers, table-rule lines.
- If amount appears as "$12.99", "12.99", or "12,99" — normalize to 12.99.
- "month" is the statement month for credit-card / paystub / brokerage statements, or the receipt month for single-purchase receipts. Format YYYY-MM. Use null if you cannot read it.
- Each item's "date" is the transaction's posting/purchase date in YYYY-MM-DD. If the printed date omits the year, infer it from the statement period (transactions in Dec on a Jan statement use the previous year). Use null if you cannot read a date for an item.
- "vendor" should be the store/merchant name (or card name for statements, employer name for paystubs, brokerage name for brokerage statements). Use null if unclear.
- If you cannot read the image at all, return {"vendor": null, "month": null, "items": []}.`;

export function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') throw new Error('Not a data URL');
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith('data:')) throw new Error('Not a data URL');
  // Accept the bare mime type optionally followed by parameters (e.g. ;charset=utf-8) before ;base64,
  const match = trimmed.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+?)\s*$/);
  if (!match) throw new Error('Data URL must be base64-encoded');
  return { mimeType: match[1], base64: match[2] };
}

export function stripMarkdownFences(text) {
  // Strip code fences anywhere in the text (preamble/postamble prose is common when
  // Claude returns "Here's the extracted data: ```json {...} ```").
  const defenced = text.replace(/```(?:json)?\s*\n?/g, '').replace(/\n?```/g, '').trim();
  // If there's still surrounding prose, extract the first {...} block.
  const objMatch = defenced.match(/\{[\s\S]*\}/);
  return objMatch ? objMatch[0] : defenced;
}

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateResponse(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Response is not an object');
  }
  if (!Array.isArray(parsed.items)) {
    throw new Error('Response.items must be an array');
  }
  const items = parsed.items
    .filter(it =>
      it &&
      typeof it.description === 'string' &&
      it.description.trim().length > 0 &&
      typeof it.amount === 'number' &&
      isFinite(it.amount) &&
      it.amount !== 0
    )
    .map(it => ({
      description: it.description.trim(),
      amount: it.amount,
      date: (typeof it.date === 'string' && DATE_RE.test(it.date.trim())) ? it.date.trim() : null,
    }));

  let month = null;
  if (typeof parsed.month === 'string') {
    const trimmed = parsed.month.trim();
    if (MONTH_RE.test(trimmed)) month = trimmed;
    else if (DATE_RE.test(trimmed)) month = trimmed.slice(0, 7);
  }

  return {
    vendor: (typeof parsed.vendor === 'string' && parsed.vendor.trim()) ? parsed.vendor.trim() : null,
    month,
    items,
  };
}

export function mapError(err) {
  const status = err && err.status;
  const name = err && err.name;
  if (status === 401) return 'Invalid API key. Check Settings.';
  if (status === 429) return 'Rate limit hit. Try again in a moment.';
  if (typeof status === 'number' && status >= 500) {
    return 'Anthropic API is having trouble. Try again.';
  }
  if (name === 'APIConnectionError' || name === 'TypeError') {
    return "Couldn't reach Anthropic. Check connection.";
  }
  return "Couldn't read the receipt. Try a clearer photo.";
}

export async function extractBillFromImage(imageDataUrl, { apiKey, model }) {
  const { mimeType, base64 } = parseDataUrl(imageDataUrl);
  const isPdf = mimeType === 'application/pdf';

  const sourceBlock = isPdf
    ? {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      }
    : {
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: base64 },
      };

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  let message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [sourceBlock, { type: 'text', text: PROMPT }],
        },
      ],
    });
  } catch (err) {
    throw new Error(mapError(err), { cause: err });
  }

  const text = (message.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  const stripped = stripMarkdownFences(text);

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (parseErr) {
    throw new Error("Couldn't read the receipt. Try a clearer photo.", { cause: parseErr });
  }

  return validateResponse(parsed);
}
