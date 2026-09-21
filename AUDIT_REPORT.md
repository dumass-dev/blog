# Exhaustive Project Audit Report

**Project**: q04ti Personal Journal & Blog  
**Stack**: React + Vite, Vanilla CSS, Express, Supabase PostgreSQL, Backblaze B2  
**Date**: September 20, 2026  
**Scope**: Read-only audit of frontend, backend, security, configuration, responsive layouts, performance, accessibility, SEO, and code quality.

---

## 1. Critical Severity Issues

### SEC-01: Missing Supabase Row Level Security (RLS) Exposes Passcodes, Drafts, and Private Content
- **Area**: Security
- **Location**: Supabase Database Schema / [`src/supabase.js`](file:///c:/Users/q04ti/Documents/blog/src/supabase.js#L68-L156) / [`src/components/ProtectedEntryModal.jsx`](file:///c:/Users/q04ti/Documents/blog/src/components/ProtectedEntryModal.jsx#L49-L74)
- **What's wrong**: The `entries` table in Supabase has no Row Level Security (RLS) policies configured for the public `anon` role. Any anonymous visitor using `VITE_SUPABASE_ANON_KEY` can query `supabase.from('entries').select('*')` directly from the browser console and read unredacted entry content, passcodes (`passcode`), cover image URLs, and draft entries (`status: 'draft'`).
- **How to reproduce**: Open the browser developer console on any page, execute `const { data } = await supabase.from('entries').select('*'); console.log(data);`, and observe all rows including passcodes and draft posts returned in plain text.
- **Suggested fix**: Enable RLS on the `entries` table in Supabase. Create policies restricting anonymous select access to `status = 'published'` and excluding sensitive columns like `passcode` from public select grants, requiring server-side API proxying for passcode verification.

---

### SEC-02: Public Anonymous Deletion Vulnerability via Direct Supabase Fallback
- **Area**: Security
- **Location**: [`src/components/Comments.jsx`](file:///c:/Users/q04ti/Documents/blog/src/components/Comments.jsx#L82-L90) / [`src/pages/admin/Dashboard.jsx`](file:///c:/Users/q04ti/Documents/blog/src/pages/admin/Dashboard.jsx#L172-L177)
- **What's wrong**: The `comments` and `entries` tables allow public DELETE operations because Supabase RLS is disabled and client components contain direct `.delete()` fallbacks. Anyone can call `supabase.from('comments').delete().eq('id', targetId)` with the anon key to wipe reader comments or entries.
- **How to reproduce**: In browser dev tools, run `await supabase.from('comments').delete().eq('id', '<any-comment-id>')`. The database row is deleted immediately without admin authentication.
- **Suggested fix**: Enforce strict Supabase RLS delete policies (`delete using (auth.uid() = admin_id)`) and remove direct client-side `.delete()` fallbacks, routing all deletions exclusively through authenticated Express server endpoints (`requireAdminAuth`).

---

### SEC-03: Hardcoded Backblaze B2 S3 API Secret Credentials Committed in Repository `.env`
- **Area**: Security
- **Location**: [`.env`](file:///c:/Users/q04ti/Documents/blog/.env#L12-L13)
- **What's wrong**: Active Backblaze B2 S3 credentials (`BACKBLAZE_KEY_ID=005b65a50b8da040000000001` and `BACKBLAZE_APPLICATION_KEY=K005RHR1tPzVwmQ4ZOiAT91CnzrI8fs`) are hardcoded in the `.env` file committed to the codebase.
- **How to reproduce**: Open `.env` in the repository root to observe plain-text Backblaze B2 application keys.
- **Suggested fix**: Immediately revoke `BACKBLAZE_APPLICATION_KEY` in the Backblaze B2 console, generate a new key pair, remove secrets from `.env`, and add `.env` to `.gitignore` while providing an `.env.example` template.

---

### CFG-01: Invalid Vercel Rewrite Configuration Causes 404 on All Production API Endpoints
- **Area**: Backend / Deployment
- **Location**: [`vercel.json`](file:///c:/Users/q04ti/Documents/blog/vercel.json#L3)
- **What's wrong**: `vercel.json` maps `/api/(.*)` to `/api/index.js`, but no `api/` directory or `api/index.js` file exists in the repository (the backend server is located at `server/index.js`). When deployed to Vercel, all API routes return `404 FUNCTION_NOT_FOUND`.
- **How to reproduce**: Deploy the project to Vercel and make a GET request to `/api/posts` or `/api/health`. Vercel returns HTTP 404.
- **Suggested fix**: Re-structure the server code to export a Serverless Function handler at `api/index.js` or update `vercel.json` rewrites and builds configuration to target `server/index.js`.

---

## 2. High Severity Issues

### SEC-04: Admin Auth Privilege Escalation on Client Side
- **Area**: Security
- **Location**: [`src/context/AuthContext.jsx`](file:///c:/Users/q04ti/Documents/blog/src/context/AuthContext.jsx#L57)
- **What's wrong**: `AuthContext.jsx` sets `isAdmin: !!user` for any authenticated Supabase user. Any user who creates a Supabase account or logs in via Supabase Auth gains client-side admin privileges (`isAdmin = true`), exposing author controls and delete UI buttons.
- **How to reproduce**: Sign in with any non-admin Supabase account. `useAuth().isAdmin` evaluates to `true`, granting access to `/admin` routes in the browser.
- **Suggested fix**: Verify `user.id === ADMIN_USER_ID` or check admin role claims inside `AuthContext.jsx` before setting `isAdmin: true`.

---

### SEC-05: Stored & Reflected Cross-Site Scripting (XSS) in Markdown Viewer
- **Area**: Security
- **Location**: [`src/components/RichViewer.jsx`](file:///c:/Users/q04ti/Documents/blog/src/components/RichViewer.jsx#L28-L41)
- **What's wrong**: `RichViewer.jsx` parses markdown using `marked.parse()` and injects the raw HTML output directly into `dangerouslySetInnerHTML` without HTML sanitization. Any entry body containing raw `<script>` tags, `<iframe src="javascript:...">`, or `<img src=x onerror=...>` will execute arbitrary JavaScript in the victim's browser.
- **How to reproduce**: Create or edit an entry with content `<img src="invalid" onerror="alert(document.domain)">` and navigate to the entry page. The script executes immediately.
- **Suggested fix**: Sanitize HTML output using `DOMPurify.sanitize(htmlContent)` before passing it to `dangerouslySetInnerHTML`.

---

### CFG-02: Unconfigured `ADMIN_USER_ID` Environment Variable Blocks Local Backend Admin Operations
- **Area**: Backend / Configuration
- **Location**: [`.env`](file:///c:/Users/q04ti/Documents/blog/.env) / [`server/index.js`](file:///c:/Users/q04ti/Documents/blog/server/index.js#L43-L49)
- **What's wrong**: `ADMIN_USER_ID` is missing from `.env`. The `requireAdminAuth` middleware in `server/index.js` fails closed and returns HTTP 403 Access Denied for all authenticated backend requests (`/api/stats`, `POST /api/posts`, `POST /api/media/upload`, etc.).
- **How to reproduce**: Start the server with the included `.env` file, obtain a valid Bearer token, and send a GET request to `/api/stats`. The server logs `SECURITY ERROR: ADMIN_USER_ID environment variable is missing` and returns HTTP 403.
- **Suggested fix**: Define `ADMIN_USER_ID=<your-supabase-user-uuid>` in `.env` and document it in `.env.example`.

---

### PERF-01: Large Monolithic Client JavaScript Bundle Exceeding 500 kB Threshold
- **Area**: Performance
- **Location**: [`vite.config.js`](file:///c:/Users/q04ti/Documents/blog/vite.config.js) / [`src/App.jsx`](file:///c:/Users/q04ti/Documents/blog/src/App.jsx#L8-L24)
- **What's wrong**: Vite production build produces a single JavaScript bundle (`dist/assets/index-CwKiDZ3Q.js`) of **673.56 kB** (186.10 kB gzipped). All public pages force-load admin dependencies (`lucide-react`, admin page components, editor tools) on initial page render.
- **How to reproduce**: Run `npm run build` and inspect output chunk sizes.
- **Suggested fix**: Use React code splitting (`React.lazy()` and `Suspense`) in `App.jsx` to separate public reader routes from `/admin/*` editor routes.

---

## 3. Medium Severity Issues

### SEC-06: Unrestricted File Type Upload in Media Manager
- **Area**: Security
- **Location**: [`server/index.js`](file:///c:/Users/q04ti/Documents/blog/server/index.js#L954-L985) / [`server/b2.js`](file:///c:/Users/q04ti/Documents/blog/server/b2.js#L66-L98)
- **What's wrong**: `POST /api/media/upload` relies on `multer.memoryStorage()` without MIME type or file extension verification. An attacker with upload access can upload executable binaries (`.exe`, `.sh`), HTML files with embedded scripts (`.html`), or PHP scripts to Backblaze B2.
- **How to reproduce**: Send a `POST` request to `/api/media/upload` with a file named `shell.html` containing `<script>alert(1)</script>`. The server accepts and stores the file.
- **Suggested fix**: Validate `file.mimetype` against a strict whitelist (e.g. `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `audio/mpeg`) before uploading to B2.

---

### SEC-07: Lack of Rate Limiting on Passcode Verification, Comments, and Reactions
- **Area**: Security
- **Location**: [`server/index.js`](file:///c:/Users/q04ti/Documents/blog/server/index.js#L739-L771) (passcode verification), lines 960-985 (comments), lines 1020-1050 (reactions)
- **What's wrong**: The Express API server has no rate limiting middleware (`express-rate-limit`). Anyone can send thousands of requests per minute to brute-force 4-digit post passcodes or flood the comments and reactions tables.
- **How to reproduce**: Send 100 rapid `POST` requests to `/api/posts/:id/verify-passcode` in a loop. All requests are processed without throttling or HTTP 429 response.
- **Suggested fix**: Apply `express-rate-limit` middleware on `/api/posts/:id/verify-passcode` (e.g. max 5 attempts per 15 mins) and public mutation routes.

---

### UI-01: Standalone "Read entry →" Links Persist in Journal and Writing Views
- **Area**: Functional / Design Consistency
- **Location**: [`src/pages/Journal.jsx`](file:///c:/Users/q04ti/Documents/blog/src/pages/Journal.jsx#L141-L146) / [`src/pages/Writing.jsx`](file:///c:/Users/q04ti/Documents/blog/src/pages/Writing.jsx#L121-L126)
- **What's wrong**: Standalone `Read entry →` and `Read essay →` action links remain present on `Journal.jsx` and `Writing.jsx`, violating the minimal card design specification enforced on `Home.jsx` where entry titles serve as the sole link.
- **How to reproduce**: Navigate to `/journal` or `/writing` and inspect entry card footers. Standalone read links are displayed at the bottom of each entry.
- **Suggested fix**: Remove standalone read links from `Journal.jsx` and `Writing.jsx`, ensuring title links remain the primary navigation mechanism.

---

### A11Y-01: Sub-standard Touch Target Sizes Below 44px Minimum
- **Area**: Accessibility
- **Location**: [`src/components/ThemeToggle.jsx`](file:///c:/Users/q04ti/Documents/blog/src/components/ThemeToggle.jsx#L10-L16) / [`src/components/Header.jsx`](file:///c:/Users/q04ti/Documents/blog/src/components/Header.jsx#L106-L149)
- **What's wrong**: The theme toggle button in `ThemeToggle.jsx` has a bounding box of 24x24px (`p-1` with a 16px icon), failing WCAG 2.1 Target Size guidelines (minimum 44x44px for touch interfaces).
- **How to reproduce**: Inspect the theme toggle icon button in Chrome DevTools element inspector. Height and width measure 24px by 24px.
- **Suggested fix**: Apply minimum dimensions `min-w-[44px] min-h-[44px]` or padding `p-2.5` to `ThemeToggle.jsx`.

---

### A11Y-02: Insufficient Text Contrast Ratio in Dark Mode Muted Text Tokens
- **Area**: Accessibility
- **Location**: [`src/index.css`](file:///c:/Users/q04ti/Documents/blog/src/index.css#L22) (`--text-muted: #66645F` on `--bg: #0C0C0C`)
- **What's wrong**: In dark mode, `--text-muted` (`#66645F`) on background `#0C0C0C` yields a contrast ratio of ~3.8:1, falling below WCAG AA minimum requirement of 4.5:1 for standard text.
- **How to reproduce**: Run Lighthouse accessibility audit or inspect muted category text (`JOURNAL · 20 Sep 2026`) in dark mode using color contrast picker.
- **Suggested fix**: Adjust dark mode `--text-muted` token to `#88857F` or higher to achieve a minimum 4.5:1 contrast ratio.

---

### SEO-01: Static Document Meta Title and Missing Dynamic Page Head Management
- **Area**: SEO / Meta
- **Location**: [`index.html`](file:///c:/Users/q04ti/Documents/blog/index.html#L6-L16)
- **What's wrong**: `index.html` sets a single static title `<title>q04ti — Journal, Writing & Archive</title>`. Navigating between `/photos`, `/about`, `/archive`, or individual entry routes (`/entry/:slug`) does not update document title, Open Graph image (`og:image`), or meta description.
- **How to reproduce**: Navigate to `/about` or `/entry/speed` and observe browser tab title remaining fixed to the static default string.
- **Suggested fix**: Implement `react-helmet-async` or a lightweight `useEffect` hook updating `document.title` and meta tags per route.

---

## 4. Low Severity & Polish Issues

### CODE-01: Unused Dependencies and Imports
- **Area**: Code Quality
- **Location**: [`package.json`](file:///c:/Users/q04ti/Documents/blog/package.json#L36-L37) (`better-sqlite3`, `lowdb`) / [`src/components/Footer.jsx`](file:///c:/Users/q04ti/Documents/blog/src/components/Footer.jsx#L3-L4)
- **What's wrong**: `package.json` declares `better-sqlite3` and `lowdb` as optional dependencies, but neither is referenced in the application. `Footer.jsx` imports `useAuth`, `Lock`, and `LayoutDashboard` without using them.
- **How to reproduce**: Run grep search for `better-sqlite3` or inspect `Footer.jsx` line 3.
- **Suggested fix**: Remove unused dependencies from `package.json` and delete unused imports in `Footer.jsx`.

---

### CODE-02: Missing Lint Script and Configuration
- **Area**: Code Quality
- **Location**: [`package.json`](file:///c:/Users/q04ti/Documents/blog/package.json#L7-L13)
- **What's wrong**: `package.json` contains no `lint` script or ESLint setup, making automated static analysis unavailable in continuous integration.
- **How to reproduce**: Run `npm run lint`. npm outputs `npm ERR! Missing script: "lint"`.
- **Suggested fix**: Add `eslint` and `@eslint/js` to `devDependencies` and configure `npm run lint`.

---

### UI-02: Horizontal Scrollbar Artifact on Mobile Admin Header Action Bar
- **Area**: Responsive / UX Polish
- **Location**: [`src/pages/admin/Dashboard.jsx`](file:///c:/Users/q04ti/Documents/blog/src/pages/admin/Dashboard.jsx#L264-L267)
- **What's wrong**: On mobile viewports (<640px), the admin header action buttons container (`Refresh`, `View Public Site`, `Sign Out`) scrolls horizontally. On iOS WebKit, an scrollbar thumb appears over the buttons.
- **How to reproduce**: Open `/admin` on mobile (375px width) and swipe horizontally over top action buttons.
- **Suggested fix**: Add `scrollbar-width: none;` and `-webkit-overflow-scrolling: touch;` utility classes to hide scrollbar indicators.

---

## 5. Summary Table

| Severity | Security | Backend / Config | Responsive / UI | Performance | Accessibility | SEO / Meta | Code Quality | Total |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Critical** | 3 | 1 | 0 | 0 | 0 | 0 | 0 | **4** |
| **High** | 2 | 1 | 0 | 1 | 0 | 0 | 0 | **4** |
| **Medium** | 2 | 0 | 1 | 0 | 2 | 1 | 0 | **6** |
| **Low** | 0 | 0 | 1 | 0 | 0 | 0 | 2 | **3** |
| **Total** | **7** | **2** | **2** | **1** | **2** | **1** | **2** | **17** |

---

## 6. Verification Exceptions & Unverified Items

The following items could not be verified due to environment or infrastructure constraints:

1. **Vercel Production Deployment Rewrites**: Direct deployment verification on Vercel infrastructure could not be executed because Vercel CLI token / deployment environment is not linked locally. However, static analysis of `vercel.json` confirmed `destination: "/api/index.js"` points to a non-existent filepath.
2. **Backblaze B2 Private Storage Bucket Permissions**: Storage bucket public access policy settings in the Backblaze B2 web portal could not be inspected directly.
3. **Cross-Browser Safari Voice Dictation (`webkitSpeechRecognition`)**: Native SpeechRecognition speech dictation in `Editor.jsx` (line 70) could not be tested on iOS Safari hardware.

---

## 7. Recommended Fix Order

1. **Fix Critical Security & Data Access (SEC-01, SEC-02, SEC-03)**:
   - Configure Supabase Row Level Security (RLS) on `entries`, `comments`, and `media` tables.
   - Revoke and rotate exposed Backblaze B2 API key credentials.
   - Remove direct client `.delete()` and passcode database queries.

2. **Fix Vercel & Backend Configuration (CFG-01, CFG-02)**:
   - Fix `vercel.json` rewrites or structure `api/index.js` for Vercel serverless deployment.
   - Set `ADMIN_USER_ID` in production environment variables.

3. **Fix Authentication & Content Security (SEC-04, SEC-05, SEC-06, SEC-07)**:
   - Restrict `isAdmin` check to `user.id === ADMIN_USER_ID`.
   - Add DOMPurify sanitization in `RichViewer.jsx`.
   - Add file MIME type validation and API rate limiting (`express-rate-limit`).

4. **Optimize Performance & Bundle Size (PERF-01)**:
   - Add React code-splitting (`React.lazy()`) for `/admin/*` pages.

5. **Address UI, Accessibility & SEO (UI-01, A11Y-01, A11Y-02, SEO-01)**:
   - Remove legacy read links in `Journal.jsx` and `Writing.jsx`.
   - Adjust dark mode contrast tokens and tap target sizes.
   - Add dynamic document title updates.
