(() => {
  const TECHNICAL_ERROR = /(?:^|\s)read_only(?:\s|$)/i;
  const READABLE_ERROR = "Cette mission ne peut pas être lancée depuis cette interface.";

  function replaceTechnicalErrors() {
    const messages = document.querySelectorAll(
      'section[aria-label="Conversation avec Oscar"] [aria-live="polite"] article p'
    );
    for (const message of messages) {
      if (TECHNICAL_ERROR.test(message.textContent || "")) {
        message.textContent = READABLE_ERROR;
      }
    }
  }

  new MutationObserver(replaceTechnicalErrors).observe(document.documentElement, {
    childList:true,
    subtree:true,
  });
  replaceTechnicalErrors();
})();
