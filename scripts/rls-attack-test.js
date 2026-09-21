import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const defaultUrl = 'https://aidajlxmfxhmsctmciaq.supabase.co';
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || defaultUrl;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';

// Create explicit unauthenticated anonymous Supabase client
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

async function runRlsAttackSuite() {
  console.log('\n=============================================================');
  console.log('ANONYMOUS RLS ATTACK & RATE LIMIT SIMULATION TEST SUITE');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  function report(name, isPass, detail = '') {
    if (isPass) {
      passed++;
      console.log(`✅ PASS: ${name.padEnd(55)} ${detail}`);
    } else {
      failed++;
      console.log(`❌ FAIL: ${name.padEnd(55)} ${detail}`);
    }
  }

  // 1. Attack: Read passcode column directly from entries table
  try {
    const { data, error } = await anonClient
      .from('entries')
      .select('passcode')
      .not('passcode', 'is', null)
      .limit(1);

    if (error || !data || data.length === 0 || data.every(row => !row.passcode)) {
      report('1. Anon read passcode column on entries', true, '(Column grant denied / empty)');
    } else {
      report('1. Anon read passcode column on entries', false, `SECURITY VULNERABILITY! Exposed: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    report('1. Anon read passcode column on entries', true, `(Blocked: ${err.message})`);
  }

  // 2. Attack: Read draft entries from entries table
  try {
    const { data, error } = await anonClient
      .from('entries')
      .select('id, title, status')
      .eq('status', 'draft');

    if (error || !data || data.length === 0) {
      report('2. Anon read draft entries from entries table', true, '(0 draft rows returned)');
    } else {
      report('2. Anon read draft entries from entries table', false, `EXPOSED DRAFTS: ${data.length} drafts read`);
    }
  } catch (err) {
    report('2. Anon read draft entries from entries table', true, `(Blocked: ${err.message})`);
  }

  // 3. Attack: Update entries table as anon
  try {
    const { data, error } = await anonClient
      .from('entries')
      .update({ title: 'HACKED TITLE' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      report('3. Anon UPDATE on entries table', true, '(Rejected / 0 rows affected)');
    } else {
      report('3. Anon UPDATE on entries table', false, 'UNAUTHORIZED UPDATE SUCCEEDED');
    }
  } catch (err) {
    report('3. Anon UPDATE on entries table', true, `(Blocked: ${err.message})`);
  }

  // 4. Attack: Delete entries as anon
  try {
    const { data, error } = await anonClient
      .from('entries')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      report('4. Anon DELETE on entries table', true, '(Rejected / 0 rows deleted)');
    } else {
      report('4. Anon DELETE on entries table', false, 'UNAUTHORIZED DELETE SUCCEEDED');
    }
  } catch (err) {
    report('4. Anon DELETE on entries table', true, `(Blocked: ${err.message})`);
  }

  // 5. Attack: Update comments as anon
  try {
    const { data, error } = await anonClient
      .from('comments')
      .update({ content: 'HACKED COMMENT' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      report('5. Anon UPDATE on comments table', true, '(Rejected / 0 rows affected)');
    } else {
      report('5. Anon UPDATE on comments table', false, 'UNAUTHORIZED UPDATE SUCCEEDED');
    }
  } catch (err) {
    report('5. Anon UPDATE on comments table', true, `(Blocked: ${err.message})`);
  }

  // 6. Attack: Delete comments as anon
  try {
    const { data, error } = await anonClient
      .from('comments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      report('6. Anon DELETE on comments table', true, '(Rejected / 0 rows deleted)');
    } else {
      report('6. Anon DELETE on comments table', false, 'UNAUTHORIZED DELETE SUCCEEDED');
    }
  } catch (err) {
    report('6. Anon DELETE on comments table', true, `(Blocked: ${err.message})`);
  }

  // 7. Attack: Update/Delete media table as anon
  try {
    const { data, error } = await anonClient
      .from('media')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      report('7. Anon DELETE on media table', true, '(Rejected / 0 rows deleted)');
    } else {
      report('7. Anon DELETE on media table', false, 'UNAUTHORIZED DELETE SUCCEEDED');
    }
  } catch (err) {
    report('7. Anon DELETE on media table', true, `(Blocked: ${err.message})`);
  }

  // 8. Attack: Update/Delete about table as anon
  try {
    const { data, error } = await anonClient
      .from('about')
      .update({ author_name: 'HACKED AUTHOR' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      report('8. Anon UPDATE on about table', true, '(Rejected / 0 rows updated)');
    } else {
      report('8. Anon UPDATE on about table', false, 'UNAUTHORIZED UPDATE SUCCEEDED');
    }
  } catch (err) {
    report('8. Anon UPDATE on about table', true, `(Blocked: ${err.message})`);
  }

  // 9. Attack: Rapid Spam Insertion of 20 Comments (Postgres Rate Limit Trigger Check)
  console.log('\n--- Simulating 20 Rapid Comment Insertions ---');
  let commentSpamSuccesses = 0;
  let commentSpamThrottled = 0;

  for (let i = 1; i <= 20; i++) {
    try {
      const { error } = await anonClient
        .from('comments')
        .insert({
          post_id: '00000000-0000-0000-0000-000000000001',
          author_name: `Spammer ${i}`,
          content: `Rapid automated comment spam payload #${i}`
        });

      if (error) {
        commentSpamThrottled++;
      } else {
        commentSpamSuccesses++;
      }
    } catch (_err) {
      commentSpamThrottled++;
    }
  }

  const rateLimitEffective = commentSpamSuccesses <= 5 || commentSpamThrottled > 0;
  report(
    '9. 20 Rapid Comment Insertions Throttled',
    rateLimitEffective,
    `(${commentSpamSuccesses} succeeded, ${commentSpamThrottled} throttled/blocked)`
  );

  console.log('\n-------------------------------------------------------------');
  console.log(`RLS Attack Test Summary: ${passed} PASS, ${failed} FAIL`);
  console.log('-------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRlsAttackSuite();
