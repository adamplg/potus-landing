# POTUS Landing Page

A landing page for POTUS - an AI-powered presidential decision simulation game by [Stratara AI](https://stratara.ai).

## Overview

POTUS is an interactive leadership simulation where players step into the role of the President of the United States, making real-time decisions through voice calls with AI advisors. This repository contains the landing page for early access signup.

## Features

- **Hero Section**: Dramatic White House imagery with animated fade-in effects
- **Video Teaser**: Embedded video showcasing the game experience
- **Screenshots Gallery**: Horizontal scrollable gallery of in-game screenshots with lightbox carousel (keyboard, touch swipe, and click navigation)
- **Key Features Display**: Highlights of voice calls, command decisions, and dynamic scenarios
- **Email Signup**: Waitlist form posting to a Google Apps Script endpoint that appends to a Google Sheet
- **Confirmation Screen**: Post-signup confirmation with social sharing options
- **Responsive Design**: Optimized for desktop and mobile devices
- **Accessibility**: Keyboard-navigable gallery and lightbox, visible focus states, and full `prefers-reduced-motion` support
- **Safari-specific optimizations**: Special handling for Safari mobile performance
- **Privacy Policy**: `privacy.html`, linked from the footer and the signup form

## Analytics & Tracking

- **Google Analytics 4** (GA4): Page views, scroll tracking, and custom `sign_up` event with UTM parameter and referrer capture
- **Google Search Console**: Connected for search query insights

## Tech Stack

- Pure HTML/CSS/JavaScript (no framework dependencies, no build step)
- Google Apps Script → Google Sheets for form handling
- Google Analytics 4 for tracking
- Custom animations and parallax effects
- Mobile-optimized with sticky CTA button

## Assets

The `attached_assets/` directory contains:
- Background images (White House office for desktop/mobile) — JPEG
- Game screenshots — WebP, in two sizes: `*_thumb.webp` (480px, shown in the gallery) and `*_full.webp` (900px, fetched only when the lightbox opens)
- Feature icons (VOICE, DECIDE, SCENARIO) — WebP
- POTUS seal and logos — WebP, plus PNG favicon and apple-touch-icon
- Teaser video (H.264, faststart enabled so it streams rather than fully buffering)
- Open Graph/social media image — kept as JPEG for maximum scraper compatibility

Images are sized for roughly 2× display density. If you replace one, re-export at a
similar pixel size rather than dropping in a full-resolution original — the previous
set was around 10× larger than it rendered.

## Local Development

No build step. Serve the directory over HTTP so the form's `fetch` and clipboard
APIs behave as they do in production:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Data Handling

Subscriber exports (`*.csv`) are gitignored. They contain email addresses and IP
addresses and must never be committed or placed in the deployed web root.

## Live Site

The landing page is live at [https://bepotus.ai](https://bepotus.ai)

## About POTUS Game

POTUS lets players:
- Make voice calls to AI advisors (CIA Director, Joint Chiefs, Secretary of State)
- Navigate crises including war, terrorism, elections, espionage
- Experience the weight of presidential decision-making
- Learn about leadership and governance complexities

Learn more about Stratara and POTUS at [https://stratara.ai](https://stratara.ai)
