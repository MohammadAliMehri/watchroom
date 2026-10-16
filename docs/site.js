const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".topbar nav");

menuButton?.addEventListener("click", () => {
  const isOpen = navigation?.classList.toggle("open") ?? false;
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});

navigation?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navigation.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
    menuButton?.setAttribute("aria-label", "Open menu");
  });
});

const toast = document.querySelector(".toast");
let toastTimer;

document.querySelector(".copy-button")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = "Copied!";
    toast.textContent = "Setup commands copied. Have a lovely movie night!";
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
    setTimeout(() => { button.textContent = "Copy"; }, 1800);
  } catch {
    toast.textContent = "Select and copy the commands to continue.";
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }
});
