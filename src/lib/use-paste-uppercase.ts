import { useEffect } from "react";

/**
 * Global paste interceptor: when the user pastes text into a text input or textarea,
 * transform the pasted content to UPPERCASE. Skips fields that clearly shouldn't be
 * uppercased (numbers, CPF, e-mail, password, dates, telephone, monetary values, etc.).
 */
export function usePasteUppercase() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const NAME_SKIP = /(cpf|cnpj|valor|preco|price|telefone|fone|phone|numero|number|email|mail|senha|password|url|link|token|cep|cvv|codigo|code)/i;

    function shouldSkip(el: HTMLInputElement | HTMLTextAreaElement): boolean {
      if (el instanceof HTMLInputElement) {
        const t = (el.type || "text").toLowerCase();
        if (t !== "text" && t !== "search") return true;
      }
      const im = (el.getAttribute("inputmode") || "").toLowerCase();
      if (["numeric", "tel", "decimal", "email", "url"].includes(im)) return true;
      const id = `${el.name || ""} ${el.id || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("placeholder") || ""}`;
      if (NAME_SKIP.test(id)) return true;
      if (el.dataset.noUpper != null) return true;
      return false;
    }

    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
      if (target.readOnly || target.disabled) return;
      if (shouldSkip(target)) return;

      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      const upper = text.toLocaleUpperCase("pt-BR");
      if (upper === text) return;

      e.preventDefault();
      // Preserve undo history when possible.
      const inserted = document.execCommand?.("insertText", false, upper);
      if (!inserted) {
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        const before = target.value.slice(0, start);
        const after = target.value.slice(end);
        target.value = before + upper + after;
        const caret = start + upper.length;
        target.setSelectionRange(caret, caret);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, []);
}
