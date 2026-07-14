# Landing Page Improvement Recommendations

**Account:** muscle fit (musclefitspa.com)  
**Data period:** Last 7 days (2026-05-27 to 2026-06-02)  
**Generated:** 2026-06-02  
**Context:** Quality Score reports show **Below average landing page experience** on most active keywords. Lost IS (rank) is the primary bottleneck (~76–82%).

---

## Executive summary

The site has decent service pages, but **ads send traffic to the wrong URLs**, and even the correct pages **do not repeat what the ad promised** (especially “near me” / HSR). That mismatch is what drives Google’s “Below average” landing page experience score.

**Fix order:** (1) change final URLs in Google Ads today, (2) update page copy to match ad headlines and keywords, (3) add location + Call/WhatsApp CTAs above the fold, (4) clarify in-studio vs home service to reduce bounce from mismatched intent.

---

## What’s broken today (from Google Ads data)

| Ad group | Final URL today | Problem |
|---|---|---|
| AG-WA-Primary Whatsapp | `musclefitspa.com/` (homepage) | Generic hero; doesn’t match “best massage near me”, “deep tissue”, etc. |
| AG-WA-Sports Massage | `musclefitspa.com/` (homepage) | Sports ad group should land on `/sports-massage` — that page exists but gets **0 ad clicks** |
| Women’s Ad group | `/women-wellness` | Closest match, but missing “near me”, HSR, and pain-specific copy from ads |

### Landing page performance (last 7 days)

| URL | Clicks | Conv. | CPA | Issue |
|---|---|---|---|---|
| `/` (homepage) | 61 | 4 | ₹575 | High spend, weak efficiency |
| `/women-wellness` | 58 | 5 | ₹395 | Best performer — refine, don’t replace |
| `/pain-relief` | 1 | 0 | — | 168 impr, **0.6% CTR** — page/content mismatch |
| `/sports-massage` | 0 | 0 | — | Good page, **not used as final URL** |

### Message mismatch

- **Ads promise:** “Massage in HSR”, “Massage near HSR Layout”, “Best massage near me”, “Massage for Women Near Me”, “Deep Tissue Sports Massage”
- **Pages say:** “Haralur, Bengaluru” — never mention HSR or “near me” above the fold
- Campaign is named **HSR** but landing pages emphasize Haralur only

### Intent mismatch

Search terms like *“doorstep massage”*, *“body massage home service bangalore”*, *“kerala massage center near me”* hit ads but the business is a **studio in Haralur**, not home service. Those visitors bounce quickly and hurt LP score. Fix with keywords/negatives **and** clearer on-page positioning.

---

## Action plan (do in this order)

### Phase 1 — Google Ads URL fixes (today, no website deploy)

One-line changes in Google Ads that immediately improve relevance.

| Ad group | Change final URL to |
|---|---|
| **AG-WA-Sports Massage** | `https://www.musclefitspa.com/sports-massage` |
| **AG-WA-Primary Whatsapp** | `https://www.musclefitspa.com/pain-relief` *(or a new `/massage-hsr` page — see Phase 2)* |
| **Women’s Ad group** | Keep `https://www.musclefitspa.com/women-wellness` |

**Also:**

- Remove or pause sitelinks pointing to `/booking/`, `/signature-massage`, `/services/head-massage/` — they get impressions with **0% CTR**
- Use **one canonical URL per page** (pick trailing slash or not; currently both `/relaxation` and `/relaxation/` exist)

---

### Phase 2 — Page-by-page content fixes

Google scores LP experience on: **keyword ↔ page match**, **transparency** (who/where/how to contact), **mobile UX**, and **speed**.

#### A. `/women-wellness` — Women campaign (highest priority)

**Current H1:** “Massage for Women in Bengaluru”  
**Ads promise:** “Massage for Women Near Me”, “Deep Tissue Therapy HSR”, “Back Pain Relief Therapy”

**Change to:**

```
H1: Body Massage for Women Near HSR & Haralur
Subhead: Licensed therapists · Neck, back & muscle pain relief · Call or WhatsApp to book today
```

**Add these sections above the fold (before “Book an Appointment” scroll):**

1. **Location strip** (critical for “near me” queries):
   ```
   muscle fit — Haralur (10 min from HSR Layout, Bellandur, Sarjapur Road)
   [Call +91 90360 21984]  [WhatsApp]  [Get Directions]
   ```

2. **Service bullets matching top keywords:**
   - Body massage for women (deep tissue & therapeutic)
   - Back pain & neck stiffness relief
   - Pain relief massage — not a relaxation spa

3. **Trust block:**
   - “Female therapists available” (if true)
   - Google rating + review count (embed or screenshot)
   - “In-studio appointment · Not home service”

4. **Sticky mobile bar:** Call | WhatsApp | Book — always visible. Campaign optimizes for calls/WhatsApp; page currently only pushes “Book an Appointment”.

**Title tag / meta:**

```
Massage for Women Near HSR Layout & Haralur | muscle fit
```

---

#### B. `/sports-massage` — Sports ad group (quick win after URL swap)

**Current H1:** “Sports Massage in Bengaluru” — good start, weak on locality.

**Change to:**

```
H1: Sports Massage Near HSR & Haralur, Bangalore
Subhead: Deep tissue · Myofascial release · Recovery for runners, gym-goers & athletes
```

**Add above the fold:**

1. **Who it’s for:** runners, CrossFit, desk athletes, post-workout soreness
2. **What you offer:** sports massage, deep tissue sports massage, recovery sessions (mirror ad headlines)
3. **Location + CTA:** same location strip as women page
4. **Pricing hint:** “Sessions from ₹X” or “60 min from ₹X” — “best massage near me” searchers expect this

**After URL change:** Pin RSA headlines like “Deep Tissue Sports Massage” and “Sports Massage Near Me” — page must contain those exact phrases.

---

#### C. Homepage `/` — stop using as ad landing page

If kept for brand traffic, do not send paid “near me” keywords here.

**Optional dedicated paid page** (`/massage-hsr` or `/massage-near-me`):

```
H1: Best Massage Near HSR Layout & Haralur
Subhead: Pain relief · Deep tissue · Sports massage · Call or WhatsApp to book

[Location map embed]
[Call] [WhatsApp] [Book online]

Why muscle fit?
- Therapeutic massage, not a generic spa
- 10 min from HSR Layout, Bellandur, Sarjapur Road
- Same-day appointments available

Services: Pain Relief | Sports Massage | Women's Massage | Deep Tissue
```

Point **AG-WA-Primary Whatsapp** here instead of the homepage.

---

#### D. `/pain-relief` — rewrite or stop sending traffic

**Current copy:** *“Enjoy soothing relief and deep relaxation…”* — spa language.

**Ads say:** *“Fix Pain, Not Just Relax”*, *“Not a Spa – Pain Therapy”*.

**Rewrite hero to:**

```
H1: Pain Relief Massage Near HSR & Haralur
Subhead: Deep tissue therapy for back pain, neck stiffness & muscle tightness — clinical approach, not spa pampering
```

Replace “relaxation” language with problem → solution → outcome:

- Back pain from long sitting
- Neck & shoulder stiffness
- Sports injury recovery

This page had **168 impressions, 1 click** last week — copy is actively repelling clicks.

---

### Phase 3 — Fix the “near me / home service” mismatch

Search term data shows many **home-service** queries (*doorstep massage*, *body massage home service*, *male therapist at home*). muscle fit is a **studio**, not doorstep service.

**On every landing page, add prominently:**

```
In-studio massage at our Haralur location · We do not offer home/doorstep service
```

**In Google Ads (parallel fix):**

- Add negatives: `home service`, `doorstep`, `at home`, `kerala massage`, `male to male`, `female to male`
- These hurt LP experience even after page fixes

---

### Phase 4 — Technical & UX checklist

Run on `/women-wellness`, `/sports-massage`, and new HSR page if created:

| Check | Target | Tool |
|---|---|---|
| Mobile PageSpeed (LCP) | < 2.5s | [PageSpeed Insights](https://pagespeed.web.dev/) |
| Hero image weight | WebP, < 150KB | Compress hero images |
| Tap targets | Call/WhatsApp buttons ≥ 48px tall | Manual mobile test |
| Phone number | Clickable `tel:+919036021984` above fold | Make primary CTA |
| HTTPS | Required | Already good |
| No interstitials | No full-screen popups on landing | Check booking modal |

Most “near me” searches are mobile. Sticky Call + WhatsApp bar beats a “Book an Appointment” button through a multi-step form.

---

### Phase 5 — Match ads ↔ pages (message alignment)

| Ad headline (pin these) | Must appear on landing page |
|---|---|
| Massage for Women Near Me | H1 or first subhead on `/women-wellness` |
| Deep Tissue Therapy HSR | H1/H2 + location strip |
| Best massage near me | H1 on `/massage-hsr` or pain-relief page |
| Deep Tissue Sports Massage | H1 on `/sports-massage` |
| Not a Spa – Pain Therapy | Replace spa copy on `/pain-relief` |
| Haralur, Bengaluru | Keep, but **add** “10 min from HSR Layout” |

Google’s LP scorer compares **ad text + keyword + page content**. All three must mention the same service and location.

---

## This week’s execution checklist

### Day 1 (Ads — ~30 min)

- [ ] Change Sports ad group final URL → `/sports-massage`
- [ ] Change Primary Whatsapp final URL → `/pain-relief` or new `/massage-hsr`
- [ ] Remove low-CTR sitelinks (`/booking/`, `/signature-massage`, etc.)
- [ ] Add home-service negative keywords

### Day 2–3 (Website)

- [ ] Update `/women-wellness` H1, location strip, sticky Call/WhatsApp
- [ ] Update `/sports-massage` H1 + athlete-focused copy
- [ ] Rewrite `/pain-relief` hero (remove spa language)
- [ ] Add “in-studio only, not home service” disclaimer on all three

### Day 4 (Optional, high impact)

- [ ] Create `/massage-hsr` dedicated paid landing page
- [ ] Run PageSpeed on mobile; compress hero images

### Day 7+ (Measure)

- Re-check Quality Score in dashboard — LP component typically moves in **2–4 weeks** after relevance fixes
- Watch `/women-wellness` and `/sports-massage` CPA vs homepage

---

## Expected impact

| Fix | What it improves |
|---|---|
| Sports URL → `/sports-massage` | Ad relevance + LP experience for QS 7 sports keywords |
| Women page H1 + HSR location | “Near me” query match; should lift Women LP score first |
| Pain-relief rewrite | Stops 0.6% CTR bleed; aligns with “pain therapy” brand |
| Home-service disclaimer + negatives | Lower bounce rate from mismatched intent |
| Sticky Call/WhatsApp | Better conversion path matches campaign goal |

**Template:** `/women-wellness` converts best (₹395 CPA last 7 days). Make other pages match its structure (location, service match, Call/WhatsApp prominence), not the generic homepage.

---

## Related context (30-day vs 7-day)

From broader campaign analysis (2026-05-03 to 2026-06-02):

- Blended impression share ~14% (30d) vs ~18% (7d) — mostly WhatsApp campaign spending harder
- Lost IS (rank) still dominates (~70–89%)
- Landing page fixes address the structural QS/rank problem; URL and copy changes are the highest-leverage first step

---

## Data sources

- `get_landing_page_report` — URL performance and ad-group attribution
- `get_ad_performance` — final URLs and RSA headlines
- `get_quality_score` — LP experience component by keyword
- `get_keyword_search_term_map` — intent mismatch (home service, etc.)
- Live page review: musclefitspa.com (homepage, women-wellness, sports-massage, pain-relief)
