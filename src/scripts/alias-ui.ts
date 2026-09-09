export type AliasUIElements = {
  inputAlias: HTMLInputElement;
  aliasToggle: HTMLButtonElement;
  aliasPanel: HTMLElement;
  aliasWrap: HTMLElement;
};

export type AliasUIController = {
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  syncSubmitButton: (button: HTMLButtonElement, canSubmit: boolean) => void;
};

export function createAliasUIController(elements: AliasUIElements): AliasUIController {
  const { inputAlias, aliasToggle, aliasPanel, aliasWrap } = elements;
  let aliasOpen = false;

  const syncAliasState = (): void => {
    // 統一維護 alias 區塊的開關狀態，避免兩頁各自實作而漂移。
    inputAlias.disabled = !aliasOpen;
    aliasWrap.classList.toggle('is-disabled', !aliasOpen);
    aliasPanel.classList.toggle('is-open', aliasOpen);
    aliasPanel.classList.toggle('is-collapsed', !aliasOpen);
    aliasToggle.setAttribute('aria-expanded', String(aliasOpen));
  };

  const setOpen = (open: boolean): void => {
    aliasOpen = open;
    syncAliasState();
  };

  const toggle = (): void => {
    setOpen(!aliasOpen);
  };

  const syncSubmitButton = (button: HTMLButtonElement, canSubmit: boolean): void => {
    syncAliasState();
    button.disabled = !canSubmit;
  };

  syncAliasState();

  return {
    isOpen: () => aliasOpen,
    setOpen,
    toggle,
    syncSubmitButton
  };
}
