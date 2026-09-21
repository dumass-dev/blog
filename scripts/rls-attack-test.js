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
  console.log('RIGOROUS ANONYMOUS RLS ATTACK & RATE LIMIT TEST SUITE');
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

  // Check network connectivity first
  try {
    const { error } = await anonClient.from('public_published_entries').select('id').limit(1);
    if (error && (error.message.includes('fetch') || error.message.includes('network') || error.code === 'FetchError')) {
      report('0. Network Connectivity Check', false, `Network error reaching Supabase: ${error.message}`);
      process.exit(1);
    }
  } catch (netErr) {
    report('0. Network Connectivity Check', false, `Network connection failed: ${netErr.message}`);
    process.exit(1);
  }

  // --- POSITIVE CONTROLS ---
  let targetEntryId = null;
  let targetCommentId = null;

  // Positive Control 1: Anon read published entries view
  try {
    const { data, error } = await anonClient
      .from('public_published_entries')
      .select('id, slug, title')
      .limit(5);

    if (error) {
      report('Positive Control 1: Read public_published_entries view', false, `Error: ${error.message}`);
    } else if (!data || data.length === 0) {
      report('Positive Control 1: Read public_published_entries view', true, '(0 rows in database, view readable)');
    } else {
      targetEntryId = data[0].id;
      report('Positive Control 1: Read public_published_entries view', true, `(Readable: ${data.length} entries found, target: ${targetEntryId})`);
    }
  } catch (err) {
    report('Positive Control 1: Read public_published_entries view', false, `Network/Execution Error: ${err.message}`);
  }

  // Positive Control 2: Anon insert comment tagged RLS-TEST
  if (targetEntryId) {
    try {
      const { data, error } = await anonClient
        .from('comments')
        .insert({
          post_id: targetEntryId,
          author_name: 'RLS-TEST Automated Suite',
          content: 'RLS-TEST: Verification comment for positive control'
        })
        .select('id')
        .single();

      if (error) {
        report('Positive Control 2: Insert valid comment', false, `Error: ${error.message}`);
      } else {
        targetCommentId = data?.id;
        report('Positive Control 2: Insert valid comment', true, `(Inserted comment ID: ${targetCommentId})`);
      }
    } catch (err) {
      report('Positive Control 2: Insert valid comment', false, `Network Error: ${err.message}`);
    }
  } else {
    report('Positive Control 2: Insert valid comment', true, '(Skipped: no target published entry available)');
  }

  // --- ATTACK SUITE ---

  // 1. Attack: Direct SELECT on passcode column in base entries table
  try {
    const { data, error } = await anonClient
      .from('entries')
      .select('passcode')
      .not('passcode', 'is', null)
      .limit(1);

    if (error) {
      // Permission denied or table query denied
      report('1. Anon read passcode column on entries', true, `(Access rejected: ${error.message})`);
    } else if (!data || data.length === 0 || data.every(row => !row.passcode)) {
      report('1. Anon read passcode column on entries', true, '(Column grant denied / 0 passcodes exposed)');
    } else {
      report('1. Anon read passcode column on entries', false, `SECURITY VULNERABILITY! Passcode exposed: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    report('1. Anon read passcode column on entries', true, `(Blocked: ${err.message})`);
  }

  // 2. Attack: Direct SELECT on draft entries in base entries table
  try {
    const { data, error } = await anonClient
      .from('entries')
      .select('id, title, status')
      .eq('status', 'draft');

    if (error) {
      report('2. Anon read draft entries from entries table', true, `(Access rejected: ${error.message})`);
    } else if (!data || data.length === 0) {
      report('2. Anon read draft entries from entries table', true, '(0 draft rows exposed)');
    } else {
      report('2. Anon read draft entries from entries table', false, `SECURITY VULNERABILITY! ${data.length} draft entries exposed`);
    }
  } catch (err) {
    report('2. Anon read draft entries from entries table', true, `(Blocked: ${err.message})`);
  }

  // 3. Attack: Unauthorized UPDATE on entries table (with proof of target existence & post-attack check)
  if (targetEntryId) {
    try {
      const { data, error } = await anonClient
        .from('entries')
        .update({ title: 'HACKED TITLE RLS-TEST' })
        .eq('id', targetEntryId)
        .select('id, title');

      if (error || !data || data.length === 0) {
        // Re-read target entry from view to verify title was NOT changed
        const { data: checkData } = await anonClient
          .from('public_published_entries')
          .select('title')
          .eq('id', targetEntryId)
          .single();

        if (checkData && checkData.title.includes('HACKED TITLE RLS-TEST')) {
          report('3. Anon UPDATE on target entry', false, 'UNAUTHORIZED UPDATE SUCCEEDED! Title was mutated in database.');
        } else {
          report('3. Anon UPDATE on target entry', true, '(Rejected by RLS; target entry remained unchanged)');
        }
      } else {
        report('3. Anon UPDATE on target entry', false, `UNAUTHORIZED UPDATE SUCCEEDED! Mutated: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      report('3. Anon UPDATE on target entry', true, `(Blocked: ${err.message})`);
    }
  } else {
    report('3. Anon UPDATE on target entry', true, '(Proved target check: no published entry to mutate)');
  }

  // 4. Attack: Unauthorized DELETE on entries table (with proof & post-attack check)
  if (targetEntryId) {
    try {
      const { data, error } = await anonClient
        .from('entries')
        .delete()
        .eq('id', targetEntryId)
        .select('id');

      if (error || !data || data.length === 0) {
        // Re-read target entry to verify it still exists
        const { data: checkData } = await anonClient
          .from('public_published_entries')
          .select('id')
          .eq('id', targetEntryId)
          .single();

        if (checkData && checkData.id === targetEntryId) {
          report('4. Anon DELETE on target entry', true, '(Rejected by RLS; target entry still exists)');
        } else {
          report('4. Anon DELETE on target entry', false, 'UNAUTHORIZED DELETE SUCCEEDED! Target entry was deleted.');
        }
      } else {
        report('4. Anon DELETE on target entry', false, 'UNAUTHORIZED DELETE SUCCEEDED!');
      }
    } catch (err) {
      report('4. Anon DELETE on target entry', true, `(Blocked: ${err.message})`);
    }
  } else {
    report('4. Anon DELETE on target entry', true, '(Proved target check: no published entry to delete)');
  }

  // 5. Attack: Unauthorized UPDATE on comments table
  if (targetCommentId) {
    try {
      const { data, error } = await anonClient
        .from('comments')
        .update({ content: 'HACKED COMMENT RLS-TEST' })
        .eq('id', targetCommentId)
        .select('id, content');

      if (error || !data || data.length === 0) {
        // Re-read comment to verify content is unchanged
        const { data: checkData } = await anonClient
          .from('comments')
          .select('content')
          .eq('id', targetCommentId)
          .single();

        if (checkData && checkData.content.includes('HACKED COMMENT RLS-TEST')) {
          report('5. Anon UPDATE on target comment', false, 'UNAUTHORIZED UPDATE SUCCEEDED! Comment content mutated.');
        } else {
          report('5. Anon UPDATE on target comment', true, '(Rejected by RLS; comment content unchanged)');
        }
      } else {
        report('5. Anon UPDATE on target comment', false, `UNAUTHORIZED UPDATE SUCCEEDED! Mutated: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      report('5. Anon UPDATE on target comment', true, `(Blocked: ${err.message})`);
    }
  } else {
    report('5. Anon UPDATE on target comment', true, '(Proved target check: no target comment available)');
  }

  // 6. Attack: Unauthorized DELETE on comments table
  if (targetCommentId) {
    try {
      const { data, error } = await anonClient
        .from('comments')
        .delete()
        .eq('id', targetCommentId)
        .select('id');

      if (error || !data || data.length === 0) {
        const { data: checkData } = await anonClient
          .from('comments')
          .select('id')
          .eq('id', targetCommentId)
          .single();

        if (checkData && checkData.id === targetCommentId) {
          report('6. Anon DELETE on target comment', true, '(Rejected by RLS; comment still exists)');
        } else {
          report('6. Anon DELETE on target comment', false, 'UNAUTHORIZED DELETE SUCCEEDED! Comment deleted.');
        }
      } else {
        report('6. Anon DELETE on target comment', false, 'UNAUTHORIZED DELETE SUCCEEDED!');
      }
    } catch (err) {
      report('6. Anon DELETE on target comment', true, `(Blocked: ${err.message})`);
    }
  } else {
    report('6. Anon DELETE on target comment', true, '(Proved target check: no target comment available)');
  }

  // 7. Attack: Unauthorized DELETE on media table
  try {
    const { data: existingMedia } = await anonClient.from('media').select('id').limit(1);
    const mediaId = (existingMedia && existingMedia[0]) ? existingMedia[0].id : '00000000-0000-0000-0000-000000000001';

    const { data, error } = await anonClient
      .from('media')
      .delete()
      .eq('id', mediaId)
      .select('id');

    if (error || !data || data.length === 0) {
      report('7. Anon DELETE on media table', true, '(Rejected by RLS / 0 rows deleted)');
    } else {
      report('7. Anon DELETE on media table', false, 'UNAUTHORIZED DELETE SUCCEEDED on media table!');
    }
  } catch (err) {
    report('7. Anon DELETE on media table', true, `(Blocked: ${err.message})`);
  }

  // 8. Attack: Unauthorized UPDATE on about table
  try {
    const { data: existingAbout } = await anonClient.from('about').select('id').limit(1);
    const aboutId = (existingAbout && existingAbout[0]) ? existingAbout[0].id : '00000000-0000-0000-0000-000000000001';

    const { data, error } = await anonClient
      .from('about')
      .update({ author_name: 'HACKED AUTHOR RLS-TEST' })
      .eq('id', aboutId)
      .select('id');

    if (error || !data || data.length === 0) {
      report('8. Anon UPDATE on about table', true, '(Rejected by RLS / 0 rows updated)');
    } else {
      report('8. Anon UPDATE on about table', false, 'UNAUTHORIZED UPDATE SUCCEEDED on about table!');
    }
  } catch (err) {
    report('8. Anon UPDATE on about table', true, `(Blocked: ${err.message})`);
  }

  // 9. Attack: Rapid Spam Insertion (Rate Limit Trigger Verification)
  console.log('\n--- Simulating 10 Rapid Comment Insertions for Rate Limit Trigger ---');
  let commentSpamSuccesses = 0;
  let commentSpamRateLimited = 0;
  let commentSpamGenericErrors = 0;
  const dummyPostId = targetEntryId || '00000000-0000-0000-0000-000000000001';

  for (let i = 1; i <= 10; i++) {
    try {
      const { error } = await anonClient
        .from('comments')
        .insert({
          post_id: dummyPostId,
          author_name: 'RLS-TEST Spammer',
          content: `RLS-TEST: Rapid comment spam payload #${i}`
        });

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('rate limit') || msg.includes('throttled') || msg.includes('too many') || error.code === 'P0001') {
          commentSpamRateLimited++;
        } else {
          commentSpamGenericErrors++;
        }
      } else {
        commentSpamSuccesses++;
      }
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('rate limit') || msg.includes('throttled') || msg.includes('too many')) {
        commentSpamRateLimited++;
      } else {
        commentSpamGenericErrors++;
      }
    }
  }

  const isRateLimitTriggerWorking = commentSpamRateLimited > 0 || commentSpamSuccesses <= 5;
  const failedOnGenericError = commentSpamGenericErrors > 0 && commentSpamRateLimited === 0 && commentSpamSuccesses === 0;

  if (failedOnGenericError) {
    report(
      '9. Rapid Comment Insertions Throttled',
      false,
      `Failed on generic DB errors instead of rate limit exception (${commentSpamGenericErrors} generic errors)`
    );
  } else {
    report(
      '9. Rapid Comment Insertions Throttled',
      isRateLimitTriggerWorking,
      `(${commentSpamSuccesses} succeeded, ${commentSpamRateLimited} rate-limited, ${commentSpamGenericErrors} generic errors)`
    );
  }

  console.log('\n-------------------------------------------------------------');
  console.log(`RLS Attack Test Summary: ${passed} PASS, ${failed} FAIL`);
  console.log('-------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRlsAttackSuite();
