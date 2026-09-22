/**
 * Helper to resolve entry detail state from cache
 */
export function resolveEntryDetailState(slug, cached) {
  const hasValidContent = Boolean(cached && typeof cached.content === 'string' && cached.content.trim() !== '');

  if (!hasValidContent) {
    return {
      data: null,
      loading: true,
      error: null,
      isUnlocked: false
    };
  }

  const hasPasscode = Boolean(cached.has_passcode || (cached.passcode && cached.passcode.trim() !== ''));
  return {
    data: {
      entry: {
        ...cached,
        has_passcode: hasPasscode,
        content: hasPasscode ? '🔒 This entry is passcode-protected.' : cached.content
      },
      prev: null,
      next: null
    },
    loading: false,
    error: null,
    isUnlocked: !hasPasscode
  };
}

export function shouldShowCommentsAndReactions(entry) {
  if (!entry) return false;
  const isPhotoEntry = Boolean(
    entry.type === 'photo' ||
    (entry.category && entry.category.toLowerCase() === 'photos')
  );
  return !isPhotoEntry;
}
