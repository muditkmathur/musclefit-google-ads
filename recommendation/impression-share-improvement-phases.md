# Impression Share & Landing Page Improvement — Phase Reference

**Account:** muscle fit (musclefitspa.com)  
**Goal:** Improve impression share by fixing Ad Rank (bid × Quality Score), primarily via landing page experience and URL relevance.  
**Root cause:** Lost IS (rank) dominates (~65–86%). Landing page experience is **Below average** on most keywords. Ads and pages mismatch on “near me”, HSR, and service intent.

**Fix order:** Phase 1 (Ads URLs) → Phase 2 (page copy) → Phase 3 (intent/negatives) → Phase 4 (technical UX) → Phase 5 (ad ↔ page alignment) → Phase 6 (keywords, bids, measurement).

---

## Phase overview

| Phase | Where | Effort | Impact | Status (as of Jun 2026) |
|---|---|---|---|---|
| **1** | Google Ads UI | ~30 min | Immediate URL relevance | **Done** — RSAs updated; sitelinks partially pending |
| **2** | Website CMS | 1–2 days | LP experience, QS, rank | **Not started** |
| **3** | Ads + website | ~1 hr | Lower bounce, cleaner traffic | **Partial** — negatives TBD |
| **4** | Website / dev | ~half day | Mobile UX, speed | **Not started** |
| **5** | Ads + website | Ongoing | Ad relevance + LP score | **Not started** |
| **6** | Google Ads UI | Ongoing | Efficiency, budget, IS | **In progress** |

---

## Phase 1 — Google Ads URL & asset fixes

**No website deploy required.** Change where paid clicks land and stop extensions from sending traffic to wrong pages.

### 1.1 Final URL changes (per ad group)

| Ad group | Campaign | Final URL |
|---|---|---|
| **AG-WA-Sports Massage** | Search \| WhatsApp + Calls | `https://www.musclefitspa.com/sports-massage` |
| **AG-WA-Primary Whatsapp** | Search \| WhatsApp + Calls | `https://www.musclefitspa.com/pain-relief` *(or `/massage-hsr` after Phase 2)* |
| **Women's Ad group** | Search \| Women \| Calls + WhatsApp \| HSR | `https://www.musclefitspa.com/women-wellness` *(verify only)* |

### 1.2 Google Ads UI steps

**Before you start:** Open [Google Ads](https://ads.google.com) → muscle fit account. Have the three URLs above ready to copy.

#### Step A — Update final URLs on responsive search ads

Final URL lives on **each ad**, not the ad group.

1. **Sports Massage**
   - Campaigns → **Search \| WhatsApp + Calls** → ad group **AG-WA-Sports Massage**
   - Ads & assets → **Ads** → edit enabled RSA
   - Final URL → `https://www.musclefitspa.com/sports-massage`
   - Display path (optional): `sports-massage`
   - Save

2. **Primary Whatsapp**
   - Same campaign → **AG-WA-Primary Whatsapp**
   - Edit enabled RSA → Final URL → `https://www.musclefitspa.com/pain-relief`
   - Display path: `pain-relief`
   - Save

3. **Women — verify only**
   - Campaign **Search \| Women \| Calls + WhatsApp \| HSR** → **Women's Ad group**
   - Confirm Final URL = `https://www.musclefitspa.com/women-wellness` (exact string that loads without redirect)

**Important:** You must be **inside the ad group** (breadcrumb shows ad group name), not at campaign-level Ads — otherwise you may edit the wrong ad.

#### Step B — Check for other ads using the homepage

1. Ads & assets → Ads (account level) → filter all statuses
2. Find any ad in Sports or Primary still pointing to `https://www.musclefitspa.com/`
3. Update URL or pause if duplicate/legacy

#### Step C — Clean up sitelinks

1. Ads & assets → Assets → **Sitelinks** (campaign + account level)
2. **Pause or remove** URLs with 0% CTR or wrong intent:

| URL | Action |
|---|---|
| `.../booking/` | Pause |
| `.../signature-massage` | Pause |
| `.../services/head-massage/` | Pause |
| `.../services/deep-tissue-massage/` | Pause unless intentionally promoted |
| `.../relaxation/` or `.../relaxation` | Pause (duplicate variants) |
| Homepage `/` via sitelink | Pause |
| Blog posts (e.g. `/post/deep-tissue-massage-...`) | Pause |

3. **Keep or add** useful sitelinks:

| Sitelink text | URL |
|---|---|
| Sports Massage | `https://www.musclefitspa.com/sports-massage` |
| Massage for Women | `https://www.musclefitspa.com/women-wellness` |
| Pain Relief | `https://www.musclefitspa.com/pain-relief` |

#### Step D — URL consistency

Use the exact URL that loads **without redirect** (with or without trailing slash — pick one format everywhere).

#### Step E — Verify after save

- [ ] Sports → `/sports-massage`
- [ ] Primary → `/pain-relief`
- [ ] Women → `/women-wellness`
- [ ] No enabled paid search ad uses homepage `/`
- [ ] Low-CTR sitelinks paused
- [ ] Ad status = Eligible

### 1.3 Phase 1 verification (Landing pages report)

Within 3–7 days, confirm in **Landing pages** report:

- Clicks shifting from `/` → `/sports-massage` and `/pain-relief`
- `/sports-massage` receiving ad-group-attributed traffic
- Sitelink URLs no longer consuming spend with 0 conversions

---

## Phase 2 — Landing page content fixes

Google scores LP experience on: **keyword ↔ page match**, **transparency**, **mobile UX**, **speed**.

### 2A. `/women-wellness` — Women campaign (highest priority)

**Current H1:** “Massage for Women in Bengaluru”  
**Ads promise:** “Massage for Women Near Me”, “Deep Tissue Therapy HSR”, “Back Pain Relief Therapy”

**Hero copy:**

```
H1: Body Massage for Women Near HSR & Haralur
Subhead: Licensed therapists · Neck, back & muscle pain relief · Call or WhatsApp to book today
```

**Above the fold — add:**

1. **Location strip**
   ```
   muscle fit — Haralur (10 min from HSR Layout, Bellandur, Sarjapur Road)
   [Call +91 90360 21984]  [WhatsApp]  [Get Directions]
   ```

2. **Service bullets**
   - Body massage for women (deep tissue & therapeutic)
   - Back pain & neck stiffness relief
   - Pain relief massage — not a relaxation spa

3. **Trust block**
   - Female therapists available (if true)
   - Google rating + review count
   - In-studio appointment · Not home service

4. **Sticky mobile bar:** Call | WhatsApp | Book

**Title tag / meta:**

```
Massage for Women Near HSR Layout & Haralur | muscle fit
```

### 2B. `/sports-massage` — Sports ad group

**Hero copy:**

```
H1: Sports Massage Near HSR & Haralur, Bangalore
Subhead: Deep tissue · Myofascial release · Recovery for runners, gym-goers & athletes
```

**Above the fold — add:**

1. Who it’s for: runners, CrossFit, desk athletes, post-workout soreness
2. What you offer: sports massage, deep tissue sports massage, recovery sessions
3. Same location strip + CTAs as women page
4. Pricing hint: “Sessions from ₹X” or “60 min from ₹X”

Pin RSA headlines “Deep Tissue Sports Massage” and “Sports Massage Near Me” — page must contain those phrases.

### 2C. `/pain-relief` — Primary Whatsapp landing page

**Current problem:** Spa language (“soothing relief and deep relaxation”) vs ads (“Fix Pain, Not Just Relax”, “Not a Spa – Pain Therapy”).

**Hero copy:**

```
H1: Pain Relief Massage Near HSR & Haralur
Subhead: Deep tissue therapy for back pain, neck stiffness & muscle tightness — clinical approach, not spa pampering
```

**Content themes (replace relaxation copy):**

- Back pain from long sitting
- Neck & shoulder stiffness
- Sports injury recovery

### 2D. Optional: `/massage-hsr` or `/massage-near-me` — dedicated Primary page

Use instead of `/pain-relief` for **AG-WA-Primary Whatsapp** if you want a generic “near me” page:

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

### 2E. Homepage `/` — do not use for paid search

Keep for brand/organic only. Do not set as final URL for “near me” keywords.

**Template:** `/women-wellness` is the best-converting page structure — replicate its layout (location, service match, Call/WhatsApp prominence) on other landing pages.

---

## Phase 3 — Fix “near me / home service” mismatch

muscle fit is an **in-studio** business in Haralur, not doorstep/home service. Mismatched queries hurt LP score and waste spend.

### 3.1 On every landing page — add prominently

```
In-studio massage at our Haralur location · We do not offer home/doorstep service
```

### 3.2 Google Ads — negative keywords (campaign or account level)

Add as phrase or exact negatives:

- `home service`
- `doorstep`
- `at home`
- `kerala massage`
- `male to male`
- `female to male`
- `massage at home`
- `home service near me`

Review search terms weekly and add new home-service variants.

---

## Phase 4 — Technical & UX checklist

Run on `/women-wellness`, `/sports-massage`, `/pain-relief`, and any new HSR page:

| Check | Target | Tool |
|---|---|---|
| Mobile PageSpeed (LCP) | < 2.5s | [PageSpeed Insights](https://pagespeed.web.dev/) |
| Hero image weight | WebP, < 150KB | Compress hero images |
| Tap targets | Call/WhatsApp buttons ≥ 48px tall | Manual mobile test |
| Phone number | Clickable `tel:+919036021984` above fold | Primary CTA |
| HTTPS | Required | Already good |
| No interstitials | No full-screen popups on landing | Check booking modal |

Most “near me” searches are mobile. **Sticky Call + WhatsApp** beats a multi-step “Book an Appointment” flow for campaigns optimized to calls/WhatsApp.

---

## Phase 5 — Match ads ↔ pages (message alignment)

Google compares **ad text + keyword + page content**. All three must mention the same service and location.

| Ad headline (pin in RSA) | Must appear on landing page |
|---|---|
| Massage for Women Near Me | H1 or first subhead on `/women-wellness` |
| Deep Tissue Therapy HSR | H1/H2 + location strip |
| Best massage near me | H1 on `/massage-hsr` or `/pain-relief` |
| Deep Tissue Sports Massage | H1 on `/sports-massage` |
| Not a Spa – Pain Therapy | Hero on `/pain-relief` (no spa language) |
| Haralur, Bengaluru | Keep, but **add** “10 min from HSR Layout” |

### Ad group ↔ landing page map (target state)

| Ad group | Final URL | Primary keywords |
|---|---|---|
| Women's Ad group | `/women-wellness` | body massage for female/women near me, pain relief for women |
| AG-WA-Sports Massage | `/sports-massage` | sports massage near me, sports massage bangalore |
| AG-WA-Primary Whatsapp | `/pain-relief` or `/massage-hsr` | best massage near me, massage centres near me, deep tissue |

---

## Phase 6 — Keywords, bids & measurement

After Phases 1–2, tune spend toward what works and measure LP/QS movement.

### 6.1 Prune or restrict low-QS budget drains

| Keyword | Action | Reason |
|---|---|---|
| `best massage near me` (Primary, QS 1) | Lower bid or pause | High spend, QS 1, LP below avg |
| `massage near me` (Broad, Women, QS 1) | Restrict to phrase/exact or pause | Broad + QS 1 |
| `massage centres near me` | Review; lower bid if LP still below avg | QS 3, ad relevance below avg |
| `deep tissue massage` / `massage for back pain` (Women, QS 2) | Pause or tighten match | Low QS, weak conv |

### 6.2 Invest in rank-limited winners (QS 6–7)

Raise bids or target CPA on keywords with **good QS, competitive bottleneck**:

- `sports massage near me` (QS 7) → Sports ad group, `/sports-massage`
- `sports massage bangalore` (QS 7)
- `sports massage` (QS 7)
- `back pain massage` (QS 6, Women)

### 6.3 Budget guidance

| Campaign | Guidance |
|---|---|
| **Women \| HSR** | Do **not** raise budget until rank improves (Phase 2). Historically underspent (~32–61% of cap). |
| **WhatsApp + Calls** | Do **not** raise budget while Primary CPA is high. Fix `/pain-relief` and sitelinks first. Sports ad group is the efficient path. |
| **When to raise Women budget** | After LP experience improves and Lost IS (budget) appears consistently with good CPA. |

### 6.4 What to measure

| When | Check | Success signal |
|---|---|---|
| 3–7 days | Landing pages report | Traffic on `/sports-massage`, `/pain-relief`; less on `/` |
| 7 days | Campaign CPA, ad group CPA | Sports & Women CPA stable or down |
| 2–4 weeks | Quality Score → LP experience | “Below average” → “Average” on top keywords |
| 2–4 weeks | Impression share, Lost IS (rank) | Rank loss down 5–10 pp on fixed ad groups |

**Dashboard pages in this repo:** Campaigns, Landing pages, Quality Score (Google Ads sidebar group).

---

## Master execution checklist

### Phase 1 — Google Ads (~30 min)

- [x] Sports ad group final URL → `/sports-massage`
- [x] Primary Whatsapp final URL → `/pain-relief`
- [x] Women ad group → `/women-wellness` verified
- [ ] Pause sitelinks: `/booking/`, `/signature-massage`, `/services/head-massage/`, `/relaxation/`, homepage, blog posts
- [ ] One canonical URL format (slash vs no-slash)

### Phase 2 — Website (1–2 days)

- [ ] `/women-wellness` — H1, location strip, sticky Call/WhatsApp
- [ ] `/sports-massage` — H1, athlete copy, location strip
- [ ] `/pain-relief` — rewrite hero (remove spa language)
- [ ] Optional: create `/massage-hsr` and point Primary Whatsapp there

### Phase 3 — Intent (~1 hr)

- [ ] “In-studio only” disclaimer on all landing pages
- [ ] Home-service negative keywords in both campaigns

### Phase 4 — Technical (~half day)

- [ ] Mobile PageSpeed on key pages
- [ ] Compress hero images
- [ ] Sticky mobile CTA bar

### Phase 5 — Alignment (ongoing)

- [ ] Pin RSA headlines; confirm matching text on each landing page
- [ ] Title tags / meta updated per page

### Phase 6 — Optimize (ongoing)

- [ ] Restrict `best massage near me` and other QS 1 drains
- [ ] Raise bids on QS 7 sports keywords
- [ ] Weekly: landing pages, search terms, QS review

---

## Expected impact by phase

| Phase | What it improves |
|---|---|
| 1 | Ad relevance; traffic routed to correct URLs; less sitelink waste |
| 2 | Landing page experience → Quality Score → Ad Rank → impression share |
| 3 | Lower bounce from home-service queries; cleaner conversion data |
| 4 | Mobile LP score; faster post-click experience |
| 5 | Ad relevance component; stronger keyword–page match |
| 6 | CPA efficiency; budget toward Sports/Women winners |

---

## Related files

- `recommendation/landing-page-improvements.md` — Original detailed analysis and baseline data (May 2026)
- Google Ads MCP tools: `get_campaign_report`, `get_landing_page_report`, `get_quality_score`, `get_ad_performance`, `get_ad_groups`

---

## Quick reference — target final URLs

```
Women:     https://www.musclefitspa.com/women-wellness
Sports:    https://www.musclefitspa.com/sports-massage
Primary:   https://www.musclefitspa.com/pain-relief
           (or https://www.musclefitspa.com/massage-hsr after Phase 2D)
Phone:     +91 90360 21984
WhatsApp:  https://wa.me/919036021984
```
