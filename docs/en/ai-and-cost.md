# AI and cost

## 1. Where the model comes from

Yanfield ships no API key and stores no credentials. It borrows one of two routes already registered in DeepSeek Harness:

| Route | Display name | Credential | When to use |
| --- | --- | --- | --- |
| `deepseek-account` | DeepSeek account | The DeepSeek account signed in to Harness | Recommended; zero setup, balance readable |
| `deepseek-official` | DeepSeek official API key | `DEEPSEEK_API_KEY` (env or Harness model page) | Pay per token; no account sign-in on the client |

Switch them in `Settings → Model services`; an unavailable route explains itself:

- account route not ready: "Not signed in to DeepSeek yet: sign in to DSH and this route works immediately"
- key route not ready: "No DeepSeek API key yet: add one under Model services in DSH, or set the DEEPSEEK_API_KEY environment variable"

On first setup, Yanfield prefers a signed-in account route, then an official key route with credentials. Restarting preserves the selected route. If the official route reports a missing credential, the request can fall back to a signed-in account route.

## 2. Model catalog

DeepSeek's built-in catalog (as returned by Harness):

| Model ID | Name | Context | Input |
| --- | --- | --- | --- |
| `deepseek-flash` | DeepSeek-V4.1-Flash | 1,048,576 | text and images |
| `deepseek-v4-pro` | DeepSeek-V4-Pro | 1,048,576 | text |

- Opening the model services page syncs the catalog into the provider; new models in Harness are picked up automatically.
- You can also type a model ID manually.
- Reasoning levels: default / off / low / high / max, executed by Harness; thinking text is never written into the manuscript.

## 3. Balance

The **Balance** button under the composer queries the signed-in Harness account:

- readable: shows an amount such as `Balance ¥68.87`;
- not signed in: tells you to sign in to DSH first;
- service error: asks you to retry — it never pretends the balance is zero.

Credentials stay on the host side (Harness credential store); the browser bundle never sees them.

## 4. Prices and peak hours

Built-in DeepSeek price table (CNY per million tokens):

| Model | Period | Cached input | Uncached input | Output |
| --- | --- | --- | --- | --- |
| `deepseek-flash` | peak | 0.04 | 2 | 8 |
| `deepseek-flash` | off-peak | 0.02 | 1 | 4 |
| `deepseek-v4-pro` | peak | 0.30 | 9 | 27 |
| `deepseek-v4-pro` | off-peak | 0.15 | 4.5 | 13.5 |

- **Peak**: Beijing time, Monday–Friday 09:00–12:00 and 14:00–18:00, excluding Chinese public holidays.
- **Off-peak**: everything else (weekends and holidays all day); half the peak price.
- Legacy names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are billed as Flash.
- When DeepSeek changes prices, updating the plugin updates the table; you can also override the three unit prices in Settings.

## 5. How cost is estimated

- Per call: `(input − cached) × input price + cached × cache price + output × output price`.
- The footer's "today N tok · est. ¥X" is **today's cumulative** figure; open it for per-message details.
- If the API reports real billing, that value is shown; otherwise "estimated"; with neither, "cost unknown".
- Balance and cost are independent: balance is the real account balance, cost is a local estimate.

## 6. Context budget (unlimited by default)

Unlimited by default: DeepSeek's window is 1,048,576 tokens, so Yanfield carries as much outline, material and previous prose as fits. To cap cost, pick 96k / 128k / 256k / 512k or choose Custom and enter up to 2,000,000 tokens under Settings → AI & context.

`0 = unlimited` still has a guard: each request reserves roughly 10% of the model window plus the output allowance (`max output`, 8k when set to auto) and trims the oldest observations first. If a request still exceeds the window it fails with an explicit context-overflow message (required vs. available tokens) instead of being silently truncated.

## 7. Built-in thrift

| Behavior | Why |
| --- | --- |
| Decision rounds skip thinking | Tool selection and argument writing are structured output |
| Short tasks drop a tier | Selections, ≤800 words, or instructions like "only this paragraph / polish / one sentence" use low reasoning |
| Note organizing is conditional | Only runs for a new chapter or a ≥120-character prose change |
| Tool results are truncated | Oversized reads are cut with paging hints instead of being re-sent every round |
| Batched steps | The prompt asks the model to merge parallel reads and edits into one round |
| Cache-friendly ordering | Stable notes first, current prose and task last; cache hit rate is usually above 80% |

Reference magnitudes (peak price, real calls): one-paragraph polish ≈ ¥0.03; a chapter blueprint ≈ ¥0.03–0.17 depending on existing notes; pure chat ≈ ¥0.004.

## 8. FAQ

**Why does a task show hundreds of thousands of tokens?**
That is the conversation's cumulative input (context is re-sent each round), not one request. Most of it hits the cache, billed at 1/50 of the input price.

**Why do tasks differ so much in price?**
Number of rounds, how much was read, and how much was written. Blueprint work reads a lot of context and tends to cost more.

**Can it be cheaper?**
- Write during off-peak hours (half price);
- Use explicit scoped instructions ("only the first paragraph") instead of letting the model choose;
- Split long tasks into a few smaller ones to keep each context shorter.
