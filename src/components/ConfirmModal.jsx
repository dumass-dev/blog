import { useCallback, useRef, useState } from 'react';
import Modal from './Modal';

/**
 * Shared confirm / prompt dialogs built on the site's Modal (portal, focus
 * trap, Escape to cancel, scroll lock). Replaces window.confirm /
 * window.prompt, which block the page and look foreign. The markup and
 * buttons follow the Dashboard's existing delete-confirmation modal exactly
 * (quiet-button / quiet-button-secondary), so every confirmation looks the
 * same. Errors are NOT handled here — use toastError for those.
 *
 * useConfirm() returns [confirm, dialog]:
 *   const [confirm, confirmDialog] = useConfirm();
 *   const ok = await confirm({ title, message, confirmLabel });
 * Render {confirmDialog} once in the component. `confirm` resolves to
 * true (confirmed) or false (cancelled / Escape / overlay click).
 * `message` may be a string or a React node.
 *
 * usePrompt() returns [prompt, dialog]:
 *   const [prompt, promptDialog] = usePrompt();
 *   const url = await prompt({ title, label, placeholder, initialValue });
 * Resolves to the entered string, or null when cancelled. Enter submits.
 */
export function useConfirm() {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback(({ title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel' } = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ title, message, confirmLabel, cancelLabel });
    });
  }, []);

  const close = useCallback((result) => {
    setState(null);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  const dialog = state ? (
    <Modal isOpen onClose={() => close(false)} title={state.title || 'Are you sure?'}>
      <div className="flex flex-col space-y-4">
        <h3 className="text-lg font-serif font-medium text-[var(--text-primary)]">
          {state.title || 'Are you sure?'}
        </h3>
        {state.message ? (
          <p className="text-xs font-sans text-[var(--text-secondary)] leading-relaxed">
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end space-x-3 pt-2 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => close(false)}
            className="quiet-button-secondary text-xs cursor-pointer select-none"
          >
            {state.cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className="quiet-button text-xs bg-[var(--text-primary)] text-[var(--bg-main)] cursor-pointer select-none"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  ) : null;

  return [confirm, dialog];
}

export function usePrompt() {
  const [state, setState] = useState(null);
  const [value, setValue] = useState('');
  const resolverRef = useRef(null);

  const prompt = useCallback(({ title, label, placeholder, initialValue = '', confirmLabel = 'Save', cancelLabel = 'Cancel' } = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setValue(initialValue);
      setState({ title, label, placeholder, confirmLabel, cancelLabel });
    });
  }, []);

  const close = useCallback((result) => {
    const out = result ? value : null;
    setState(null);
    if (resolverRef.current) {
      resolverRef.current(out);
      resolverRef.current = null;
    }
  }, [value]);

  const dialog = state ? (
    <Modal isOpen onClose={() => close(false)} title={state.title || 'Enter a value'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close(true);
        }}
      >
        <div className="flex flex-col space-y-4">
          <h3 className="text-lg font-serif font-medium text-[var(--text-primary)]">
            {state.title || 'Enter a value'}
          </h3>
          {state.label ? (
            <label htmlFor="confirm-prompt-input" className="text-xs font-sans text-[var(--text-secondary)] leading-relaxed">
              {state.label}
            </label>
          ) : null}
          <input
            id="confirm-prompt-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={state.placeholder || ''}
            autoFocus
            className="quiet-input text-sm"
          />
          <div className="flex justify-end space-x-3 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => close(false)}
              className="quiet-button-secondary text-xs cursor-pointer select-none"
            >
              {state.cancelLabel}
            </button>
            <button
              type="submit"
              className="quiet-button text-xs bg-[var(--text-primary)] text-[var(--bg-main)] cursor-pointer select-none"
            >
              {state.confirmLabel}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  ) : null;

  return [prompt, dialog];
}

export default useConfirm;
