# The Red Council Public Website - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a static marketing landing page for The Red Council open source project at `/public`.

**Architecture:** Single-page static HTML with Tailwind CSS via CDN. No build step. Hydra multi-head serpent as hero centerpiece with dramatic glow effects. Mobile-first responsive design.

**Tech Stack:** HTML5, CSS3, Tailwind CSS (CDN), Vanilla JS (copy button only), Google Fonts (Geist)

---

## Task 1: Create Directory Structure

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/assets/.gitkeep`

**Step 1: Create directories and placeholder files**

```bash
cd /Users/kozman/Repos/github.com/DeepMind-public-website
mkdir -p public/assets
touch public/index.html
touch public/styles.css
touch public/assets/.gitkeep
```

**Step 2: Verify structure**

```bash
ls -la public/
```

Expected:
```
index.html
styles.css
assets/
```

**Step 3: Commit**

```bash
git add public/
git commit -m "chore: scaffold public website directory structure"
```

---

## Task 2: Create Hydra SVG Logo

**Files:**
- Create: `public/assets/hydra-logo.svg`

**Step 1: Create the SVG file**

Based on the existing logo.jpg (4-headed serpent with central body), create a vector version:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" fill="none">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <linearGradient id="redGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="100%" stop-color="#dc2626"/>
    </linearGradient>
  </defs>

  <g filter="url(#glow)" fill="url(#redGradient)">
    <!-- Central Body -->
    <ellipse cx="200" cy="220" rx="60" ry="80"/>

    <!-- Top Head (Attacker) -->
    <path d="M200 60 L180 100 L175 90 L170 105 L185 120 L200 110 L215 120 L230 105 L225 90 L220 100 Z"/>
    <circle cx="190" cy="85" r="4" fill="#0a0a0f"/>
    <circle cx="210" cy="85" r="4" fill="#0a0a0f"/>
    <path d="M200 140 Q200 120 200 110" stroke="url(#redGradient)" stroke-width="20" fill="none"/>

    <!-- Left Head (Judge) -->
    <path d="M60 200 L100 180 L90 175 L105 170 L120 185 L110 200 L120 215 L105 230 L90 225 L100 220 Z"/>
    <circle cx="85" cy="190" r="4" fill="#0a0a0f"/>
    <circle cx="85" cy="210" r="4" fill="#0a0a0f"/>
    <path d="M140 200 Q120 200 110 200" stroke="url(#redGradient)" stroke-width="20" fill="none"/>

    <!-- Right Head (Defender) -->
    <path d="M340 200 L300 180 L310 175 L295 170 L280 185 L290 200 L280 215 L295 230 L310 225 L300 220 Z"/>
    <circle cx="315" cy="190" r="4" fill="#0a0a0f"/>
    <circle cx="315" cy="210" r="4" fill="#0a0a0f"/>
    <path d="M260 200 Q280 200 290 200" stroke="url(#redGradient)" stroke-width="20" fill="none"/>

    <!-- Bottom Head (Verifier) -->
    <path d="M200 340 L180 300 L175 310 L170 295 L185 280 L200 290 L215 280 L230 295 L225 310 L220 300 Z"/>
    <circle cx="190" cy="315" r="4" fill="#0a0a0f"/>
    <circle cx="210" cy="315" r="4" fill="#0a0a0f"/>
    <path d="M200 260 Q200 280 200 290" stroke="url(#redGradient)" stroke-width="20" fill="none"/>
  </g>
</svg>
```

**Step 2: Verify SVG renders**

Open in browser: `open public/assets/hydra-logo.svg`

Expected: 4-headed serpent with red glow, dark eyes

**Step 3: Commit**

```bash
git add public/assets/hydra-logo.svg
git commit -m "feat: add Hydra logo SVG for public website"
```

---

## Task 3: Create Base HTML Structure

**Files:**
- Modify: `public/index.html`

**Step 1: Write the HTML skeleton with Tailwind CDN**

```html
<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Red Council - AI Red Team & Security</title>
  <meta name="description" content="Systematically test your LLMs and AI agents against adversarial attacks. Open source security testing platform with 165+ attack patterns.">

  <!-- Open Graph -->
  <meta property="og:title" content="The Red Council - AI Red Team & Security">
  <meta property="og:description" content="Attack. Assess. Patch. Open source LLM & AI agent security testing.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://theredcouncil.com">
  <!-- <meta property="og:image" content="https://theredcouncil.com/assets/og-image.png"> -->

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="assets/hydra-logo.svg">

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono&display=swap" rel="stylesheet">

  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            background: '#0a0a0f',
            foreground: '#fafafa',
            primary: '#3b82f6',
            destructive: '#dc2626',
            muted: '#a3a3a3',
          },
          fontFamily: {
            sans: ['Geist', 'system-ui', 'sans-serif'],
            mono: ['Geist Mono', 'monospace'],
          },
        }
      }
    }
  </script>

  <!-- Custom Styles -->
  <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-background text-foreground font-sans antialiased">

  <!-- Navigation -->
  <nav id="nav"></nav>

  <!-- Hero -->
  <section id="hero"></section>

  <!-- Stats -->
  <section id="stats"></section>

  <!-- Features -->
  <section id="features"></section>

  <!-- Quick Start -->
  <section id="quickstart"></section>

  <!-- Footer -->
  <footer id="footer"></footer>

</body>
</html>
```

**Step 2: Open in browser to verify**

```bash
open public/index.html
```

Expected: Black page with no errors in console

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add base HTML structure with Tailwind CDN"
```

---

## Task 4: Create Custom CSS Effects

**Files:**
- Modify: `public/styles.css`

**Step 1: Write custom CSS for dramatic effects**

```css
/* Background effects */
body {
  background-image:
    radial-gradient(ellipse at 50% 0%, rgba(220, 38, 38, 0.15) 0%, transparent 50%),
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 100% 100%, 50px 50px, 50px 50px;
  background-position: top center, 0 0, 0 0;
}

/* Glow pulse animation for Hydra logo */
@keyframes glow-pulse {
  0%, 100% {
    filter: drop-shadow(0 0 20px rgba(220, 38, 38, 0.6));
  }
  50% {
    filter: drop-shadow(0 0 40px rgba(220, 38, 38, 0.9));
  }
}

.hydra-logo {
  animation: glow-pulse 3s ease-in-out infinite;
}

/* Card glow on hover */
.feature-card {
  transition: all 0.3s ease;
  border: 1px solid rgba(220, 38, 38, 0.2);
}

.feature-card:hover {
  border-color: rgba(220, 38, 38, 0.6);
  box-shadow: 0 0 30px rgba(220, 38, 38, 0.2);
  transform: translateY(-4px);
}

/* Terminal scan line */
@keyframes scan {
  0% { top: 0; }
  100% { top: 100%; }
}

.terminal::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(220, 38, 38, 0.5), transparent);
  animation: scan 3s linear infinite;
}

/* Copy button feedback */
.copy-btn.copied {
  background-color: rgba(34, 197, 94, 0.2);
}

/* Glass morphism for cards */
.glass {
  background: rgba(10, 10, 15, 0.8);
  backdrop-filter: blur(10px);
}

/* Text gradient */
.text-gradient {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Responsive hero text */
.hero-title {
  font-size: clamp(2.5rem, 8vw, 5rem);
  line-height: 1.1;
}
```

**Step 2: Verify CSS loads**

Refresh browser, check for grid background pattern

**Step 3: Commit**

```bash
git add public/styles.css
git commit -m "feat: add custom CSS effects (glow, grid, animations)"
```

---

## Task 5: Build Navigation Section

**Files:**
- Modify: `public/index.html`

**Step 1: Replace nav placeholder**

```html
<!-- Navigation -->
<nav class="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16">
      <!-- Logo -->
      <a href="#" class="flex items-center gap-3">
        <img src="assets/hydra-logo.svg" alt="Hydra" class="h-8 w-8">
        <span class="font-bold text-lg hidden sm:block">The Red Council</span>
      </a>

      <!-- GitHub Stars Badge (commented out until traction) -->
      <!--
      <a href="https://github.com/sherifkozman/the-red-council" class="hidden sm:flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors">
        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        <span>Star</span>
      </a>
      -->

      <!-- CTA -->
      <a href="https://github.com/sherifkozman/the-red-council" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
        Get Started
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
      </a>
    </div>
  </div>
</nav>
```

**Step 2: Verify navigation renders**

Refresh browser, check fixed nav with glass effect

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add navigation with logo and CTA"
```

---

## Task 6: Build Hero Section

**Files:**
- Modify: `public/index.html`

**Step 1: Replace hero placeholder**

```html
<!-- Hero -->
<section id="hero" class="min-h-screen flex flex-col items-center justify-center px-4 pt-16">
  <div class="max-w-4xl mx-auto text-center">
    <!-- Hydra Logo -->
    <div class="mb-8">
      <img src="assets/hydra-logo.svg" alt="The Red Council Hydra" class="hydra-logo h-48 sm:h-64 mx-auto">
    </div>

    <!-- Headline -->
    <h1 class="hero-title font-bold tracking-tight mb-4">
      <span class="text-gradient">THE RED COUNCIL</span>
    </h1>

    <!-- Subhead -->
    <p class="text-xl sm:text-2xl text-muted mb-2">AI Red Team & Security</p>

    <!-- Tagline -->
    <p class="text-2xl sm:text-3xl font-semibold text-destructive mb-6">
      Attack. Assess. Patch.
    </p>

    <!-- Description -->
    <p class="text-lg text-muted max-w-2xl mx-auto mb-10">
      Systematically test your LLMs and AI agents against adversarial attacks before attackers find them. Closed-loop security testing: Attack → Detect → Defend → Verify.
    </p>

    <!-- CTAs -->
    <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
      <a href="https://github.com/sherifkozman/the-red-council#quick-start" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors">
        Get Started
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
      </a>
      <a href="https://github.com/sherifkozman/the-red-council" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-6 py-3 border border-white/20 hover:border-white/40 text-foreground font-medium rounded-lg transition-colors">
        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        View on GitHub
      </a>
    </div>
  </div>
</section>
```

**Step 2: Verify hero renders with animated logo**

Refresh browser, check glow pulse animation

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add hero section with Hydra logo and CTAs"
```

---

## Task 7: Build Stats Bar

**Files:**
- Modify: `public/index.html`

**Step 1: Replace stats placeholder**

```html
<!-- Stats -->
<section id="stats" class="py-12 border-y border-white/10">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      <div>
        <div class="text-3xl sm:text-4xl font-bold text-destructive">165+</div>
        <div class="text-sm text-muted mt-1">Attack Patterns</div>
      </div>
      <div>
        <div class="text-3xl sm:text-4xl font-bold text-destructive">OWASP</div>
        <div class="text-sm text-muted mt-1">Agentic Top 10</div>
      </div>
      <div>
        <div class="text-3xl sm:text-4xl font-bold text-destructive">4</div>
        <div class="text-sm text-muted mt-1">Agent Closed Loop</div>
      </div>
      <div>
        <div class="text-3xl sm:text-4xl font-bold text-destructive">MIT</div>
        <div class="text-sm text-muted mt-1">Open Source</div>
      </div>
    </div>
  </div>
</section>
```

**Step 2: Verify stats bar renders**

Refresh browser, check 4-column grid

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add stats bar section"
```

---

## Task 8: Build Features Section (4 Hydra Heads)

**Files:**
- Modify: `public/index.html`

**Step 1: Replace features placeholder**

```html
<!-- Features -->
<section id="features" class="py-24">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <h2 class="text-3xl sm:text-4xl font-bold text-center mb-4">Four Heads. One Mission.</h2>
    <p class="text-muted text-center max-w-2xl mx-auto mb-16">Each head of the Hydra represents an agent in the closed-loop security testing pipeline.</p>

    <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
      <!-- Attacker -->
      <div class="feature-card glass rounded-xl p-6">
        <div class="h-12 w-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
          <svg class="h-6 w-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        </div>
        <h3 class="text-xl font-semibold mb-2">Attacker</h3>
        <p class="text-muted text-sm">Generates adversarial prompts from 165+ curated attack patterns including jailbreaks, prompt injections, and extraction attacks.</p>
      </div>

      <!-- Judge -->
      <div class="feature-card glass rounded-xl p-6">
        <div class="h-12 w-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
          <svg class="h-6 w-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
        </div>
        <h3 class="text-xl font-semibold mb-2">Judge</h3>
        <p class="text-muted text-sm">Scores responses 0-10 for safety, detects secret leakage, and determines if a breach occurred with detailed analysis.</p>
      </div>

      <!-- Defender -->
      <div class="feature-card glass rounded-xl p-6">
        <div class="h-12 w-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
          <svg class="h-6 w-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        </div>
        <h3 class="text-xl font-semibold mb-2">Defender</h3>
        <p class="text-muted text-sm">Auto-generates hardened system prompts when breaches occur, implementing specific countermeasures against detected attack vectors.</p>
      </div>

      <!-- Verifier -->
      <div class="feature-card glass rounded-xl p-6">
        <div class="h-12 w-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
          <svg class="h-6 w-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h3 class="text-xl font-semibold mb-2">Verifier</h3>
        <p class="text-muted text-sm">Re-tests defenses to prove they work, closing the loop. Only marks as secure when the same attack no longer succeeds.</p>
      </div>
    </div>
  </div>
</section>
```

**Step 2: Verify feature cards render with hover effects**

Refresh browser, hover over cards to see glow

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add features section with 4 agent cards"
```

---

## Task 9: Build Quick Start Section

**Files:**
- Modify: `public/index.html`

**Step 1: Replace quickstart placeholder**

```html
<!-- Quick Start -->
<section id="quickstart" class="py-24 border-t border-white/10">
  <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
    <h2 class="text-3xl sm:text-4xl font-bold text-center mb-4">Quick Start</h2>
    <p class="text-muted text-center mb-10">Get up and running in under 5 minutes.</p>

    <div class="terminal relative glass rounded-xl overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <div class="h-3 w-3 rounded-full bg-red-500"></div>
        <div class="h-3 w-3 rounded-full bg-yellow-500"></div>
        <div class="h-3 w-3 rounded-full bg-green-500"></div>
        <span class="ml-2 text-xs text-muted">terminal</span>
        <button onclick="copyCode()" class="copy-btn ml-auto text-xs text-muted hover:text-foreground transition-colors px-2 py-1 rounded">
          Copy
        </button>
      </div>
      <pre class="p-4 overflow-x-auto text-sm"><code class="font-mono text-foreground"><span class="text-muted"># Clone and install</span>
git clone https://github.com/sherifkozman/the-red-council
cd the-red-council && pip install -e ".[dev]"

<span class="text-muted"># Seed the attack knowledge base</span>
python -m scripts.seed_kb

<span class="text-muted"># Start the backend</span>
uvicorn src.api.main:app --port 8000

<span class="text-muted"># In another terminal, start the frontend</span>
cd frontend && pnpm install && pnpm dev

<span class="text-muted"># Visit http://localhost:3000</span></code></pre>
    </div>
  </div>
</section>

<script>
function copyCode() {
  const code = `git clone https://github.com/sherifkozman/the-red-council
cd the-red-council && pip install -e ".[dev]"
python -m scripts.seed_kb
uvicorn src.api.main:app --port 8000`;
  navigator.clipboard.writeText(code);
  const btn = document.querySelector('.copy-btn');
  btn.textContent = 'Copied!';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = 'Copy';
    btn.classList.remove('copied');
  }, 2000);
}
</script>
```

**Step 2: Verify terminal renders with copy button**

Refresh browser, click Copy, check clipboard

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add quick start terminal section with copy button"
```

---

## Task 10: Build Footer

**Files:**
- Modify: `public/index.html`

**Step 1: Replace footer placeholder**

```html
<!-- Footer -->
<footer id="footer" class="py-12 border-t border-white/10">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-col md:flex-row items-center justify-between gap-6">
      <!-- Logo & tagline -->
      <div class="flex items-center gap-3">
        <img src="assets/hydra-logo.svg" alt="Hydra" class="h-8 w-8">
        <div>
          <div class="font-semibold">The Red Council</div>
          <div class="text-sm text-muted">Built for security researchers and AI teams</div>
        </div>
      </div>

      <!-- Links -->
      <div class="flex items-center gap-6 text-sm">
        <a href="https://github.com/sherifkozman/the-red-council#readme" target="_blank" rel="noopener" class="text-muted hover:text-foreground transition-colors">Docs</a>
        <a href="https://github.com/sherifkozman/the-red-council" target="_blank" rel="noopener" class="text-muted hover:text-foreground transition-colors">GitHub</a>
        <a href="https://github.com/sherifkozman/the-red-council/issues" target="_blank" rel="noopener" class="text-muted hover:text-foreground transition-colors">Issues</a>
        <a href="https://github.com/sherifkozman/the-red-council/blob/main/CHANGELOG.md" target="_blank" rel="noopener" class="text-muted hover:text-foreground transition-colors">Changelog</a>
      </div>

      <!-- License -->
      <div class="flex items-center gap-2 text-sm text-muted">
        <span>MIT License</span>
        <span>•</span>
        <span>© 2026</span>
      </div>
    </div>
  </div>
</footer>
```

**Step 2: Verify footer renders**

Refresh browser, check links work

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add footer with links and license"
```

---

## Task 11: Final Polish & Testing

**Files:**
- Modify: `public/index.html` (minor tweaks if needed)

**Step 1: Test mobile responsiveness**

```bash
# Open in browser and use DevTools mobile view
open public/index.html
```

Check at: 375px (iPhone SE), 768px (tablet), 1280px (desktop)

**Step 2: Validate HTML**

```bash
# Use online validator or
npx html-validate public/index.html
```

Expected: No critical errors

**Step 3: Check all links**

Click every link, verify they open correct GitHub pages

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: polish and finalize public website"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Directory structure | 2 min |
| 2 | Hydra SVG logo | 5 min |
| 3 | Base HTML | 3 min |
| 4 | Custom CSS effects | 5 min |
| 5 | Navigation | 3 min |
| 6 | Hero section | 5 min |
| 7 | Stats bar | 3 min |
| 8 | Features (4 cards) | 5 min |
| 9 | Quick start terminal | 5 min |
| 10 | Footer | 3 min |
| 11 | Polish & test | 5 min |

**Total: ~45 minutes**

**Deliverables:**
- `/public/index.html` - Complete landing page
- `/public/styles.css` - Custom effects
- `/public/assets/hydra-logo.svg` - Vector logo
