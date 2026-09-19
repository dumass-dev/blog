import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'diary.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

export function initDb() {
  // 1. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Entries Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      type TEXT CHECK(type IN ('journal', 'writing', 'update')) NOT NULL DEFAULT 'journal',
      status TEXT CHECK(status IN ('published', 'draft', 'unlisted')) NOT NULL DEFAULT 'published',
      category TEXT,
      tags TEXT,
      cover_image TEXT,
      excerpt TEXT,
      date TEXT NOT NULL,
      location TEXT,
      weather TEXT,
      mood TEXT,
      passcode TEXT,
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate missing columns if entries table existed previously
  const tableInfo = db.prepare("PRAGMA table_info(entries)").all();
  const columnNames = tableInfo.map(c => c.name);
  if (!columnNames.includes('location')) db.exec("ALTER TABLE entries ADD COLUMN location TEXT");
  if (!columnNames.includes('weather')) db.exec("ALTER TABLE entries ADD COLUMN weather TEXT");
  if (!columnNames.includes('mood')) db.exec("ALTER TABLE entries ADD COLUMN mood TEXT");
  if (!columnNames.includes('passcode')) db.exec("ALTER TABLE entries ADD COLUMN passcode TEXT");
  if (!columnNames.includes('views')) db.exec("ALTER TABLE entries ADD COLUMN views INTEGER DEFAULT 0");

  // 3. Media Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. Reactions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      reaction_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES entries(id) ON DELETE CASCADE
    )
  `);

  // 5. Comments Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author_name TEXT NOT NULL DEFAULT 'Anonymous Reader',
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES entries(id) ON DELETE CASCADE
    )
  `);

  // 6. Settings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Seed default admin user if missing
  const adminCheck = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!adminCheck) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
    console.log('Seeded default admin user (username: admin, password: admin123)');
  }

  // Seed default settings if missing
  const defaultSettings = {
    author_name: 'q04ti',
    tagline: 'thoughts, things I make, places I go, and everything in between.',
    bio: `Hi, I'm q04ti. I build software, take photographs on film, and write about minimalist design, quiet software, and living deliberately.\n\nThis website is my personal notebook and life archive — a place to think out loud, document projects, and store memories without algorithms or distraction.`,
    projects: JSON.stringify([
      { title: 'Personal Life Archive', description: 'A custom-built quiet digital notebook and diary.', link: '/' },
      { title: 'Analog Photo Press', description: 'Curated 35mm and 120 medium format photo journal.', link: '#' },
      { title: 'Monochrome Reader', description: 'Extremely lightweight RSS feed reader built for deep focus.', link: '#' }
    ]),
    links: JSON.stringify([
      { label: 'GitHub', url: 'https://github.com' },
      { label: 'Twitter / X', url: 'https://twitter.com' },
      { label: 'Email', url: 'mailto:q04ti@example.com' }
    ])
  };

  for (const [key, val] of Object.entries(defaultSettings)) {
    const existing = db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, val);
    }
  }

  // Seed rich sample entries if table is empty
  const count = db.prepare('SELECT COUNT(*) as count FROM entries').get().count;
  if (count === 0) {
    seedSampleEntries();
  }
}

function seedSampleEntries() {
  const sampleEntries = [
    {
      title: 'Building my little corner of the internet',
      slug: 'building-my-little-corner-of-the-internet',
      type: 'journal',
      status: 'published',
      category: 'Projects',
      tags: 'web, design, personal, quiet',
      cover_image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1200&auto=format&fit=crop',
      excerpt: 'Today I finally started building a personal website that actually feels like mine.',
      date: '2026-09-18T14:30:00.000Z',
      content: `Today I finally started building a personal website that actually feels like mine.

For years, I've shuffled between different platforms — Medium, Substack, Notion, static site generators with 400 dependencies. None of them felt right. They were either too corporate, too bloated, or designed to capture "engagement" rather than reflect a quiet human space.

I wanted somewhere I could write without worrying about newsletters, popups, or social metrics. Just plain typography, clean spacing, and memories.

> "A personal website is not a portfolio. It is a home you build for your mind."

Here is what I wanted to prioritize:

1. **Quiet Aesthetics**: Warm off-white paper tones, classic serif reading text, and generous whitespace.
2. **Speed & Longevity**: Lightweight code that loads in milliseconds and will still render cleanly 20 years from now.
3. **Control**: A private editor where I can write drafts, log quick updates, upload media, and manage my archive without middleman friction.

https://www.youtube.com/watch?v=dQw4w9WgXcQ

I'm looking forward to watching this archive grow over the coming months and years.`
    },
    {
      title: 'A rainy afternoon in Edinburgh',
      slug: 'a-rainy-afternoon-in-edinburgh',
      type: 'journal',
      status: 'published',
      category: 'Travel',
      tags: 'travel, scotland, photography, coffee',
      cover_image: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?q=80&w=1200&auto=format&fit=crop',
      excerpt: 'Walking down Victoria Street with a lukewarm black coffee and a bag of old paperbacks.',
      date: '2026-09-12T17:15:00.000Z',
      content: `Spent three hours sitting by the window at a small cafe off the Royal Mile. The Scottish drizzle turned the cobblestones into dark mirrors.

I brought along my Leica M3 and two rolls of Kodak Tri-X 400. There's a particular kind of light in northern cities when it rains — soft, shadowless, and deeply contemplative.

I managed to find an old copy of *The Architecture of Happiness* at Armchair Books. The smell of aged paper and wood polish inside that store is something no digital device will ever replicate.`
    },
    {
      title: 'The Beauty of the Quiet Web',
      slug: 'the-beauty-of-the-quiet-web',
      type: 'writing',
      status: 'published',
      category: 'Essays',
      tags: 'essays, internet, minimal, digital-mindfulness',
      cover_image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=1200&auto=format&fit=crop',
      excerpt: 'Why we should return to personal websites, simple feeds, and deliberate digital craftsmanship.',
      date: '2026-08-28T10:00:00.000Z',
      content: `The modern web has become intensely noisy. Almost every page you visit demands your attention: modal dialogs asking for your email address, sticky banners begging for cookie consent, floating notification badges, and algorithmically suggested "related articles."

When everything is screaming, nothing gets heard.

### Returning to First Principles

In the early 2000s, personal websites were distinct architectural expressions. People cared deeply about font pairings, line height, background colors, and the subtle pleasure of a well-typeset paragraph.

Building a quiet website means making deliberate omissions:
- **No analytics tracking scripts** constantly monitoring your readers' mouse movements.
- **No social sharing widgets** with counter badges.
- **No algorithmic recommendation engines** trying to keep you scrolling forever.

Instead, we provide a clean, peaceful space. When a reader finishes an article, they reach the bottom of the page, close the tab, and go back to living their day. That is respect for the reader.`
    },
    {
      title: 'Designing for Longevity in Software',
      slug: 'designing-for-longevity-in-software',
      type: 'writing',
      status: 'published',
      category: 'Software',
      tags: 'programming, architecture, simplicity, sqlite',
      cover_image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=1200&auto=format&fit=crop',
      excerpt: 'Reflections on plain text, SQLite, zero-dependency tools, and building systems meant to last decades.',
      date: '2026-08-14T09:30:00.000Z',
      content: `Most modern software applications are built with a shelf life of 2 to 3 years before their dependencies break or their cloud services deprecate APIs.

If you want your personal archive to survive 30 years, you must design with different principles:

1. **Store data in open, standard formats**: Plain text, Markdown, and SQLite files.
2. **Minimize complex microservice orchestration**: A single executable or plain server script is far easier to run in 2040 than a cluster of 12 containers.
3. **Keep assets local**: Self-host photos and documents whenever possible.

\`\`\`javascript
// SQLite is essentially immortal
const db = new Database('diary.db');
const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(1);
console.log(entry.title);
\`\`\`

Software should feel more like furniture than disposable plastic.`
    },
    {
      title: 'Finally got the dark mode tint just right',
      slug: 'update-2026-09-18-2342',
      type: 'update',
      status: 'published',
      category: 'Updates',
      tags: 'design, updates',
      cover_image: '',
      excerpt: 'Finally got the dark mode tint just right. Going to sleep satisfied.',
      date: '2026-09-18T23:42:00.000Z',
      content: 'Finally got the dark mode tint just right (`#131211` with soft warm cream text). Going to sleep satisfied.'
    },
    {
      title: 'Evening stroll in the park',
      slug: 'update-2026-09-18-1820',
      type: 'update',
      status: 'published',
      category: 'Updates',
      tags: 'life, walk',
      cover_image: '',
      excerpt: 'Went outside after being inside all day. Crisp autumn air.',
      date: '2026-09-18T18:20:00.000Z',
      content: 'Went outside after being inside all day. Crisp autumn air and golden light through the maples.'
    },
    {
      title: 'Late night project ideas',
      slug: 'update-2026-09-17-0103',
      type: 'update',
      status: 'published',
      category: 'Updates',
      tags: 'ideas, notes',
      cover_image: '',
      excerpt: 'New project idea. Might actually build this one.',
      date: '2026-09-17T01:03:00.000Z',
      content: 'New project idea: A physical e-ink desk display that shows only one handwritten note per day. Might actually build this one.'
    },
    {
      title: 'Listening to Chopin while scanning negatives',
      slug: 'update-2026-09-15-1515',
      type: 'update',
      status: 'published',
      category: 'Updates',
      tags: 'music, photography',
      cover_image: '',
      excerpt: 'Listening to Nocturnes while organizing film scans.',
      date: '2026-09-15T15:15:00.000Z',
      content: 'Listening to Nocturnes while organizing film scans from Edinburgh. Black and white grain looks so satisfying on the high-res scanner.'
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO entries (title, slug, type, status, category, tags, cover_image, excerpt, date, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of sampleEntries) {
    stmt.run(
      item.title,
      item.slug,
      item.type,
      item.status,
      item.category,
      item.tags,
      item.cover_image,
      item.excerpt,
      item.date,
      item.content
    );
  }

  console.log('Seeded sample entries successfully.');
}

export default db;
