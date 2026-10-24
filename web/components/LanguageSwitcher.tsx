"use client";

import React from "react";
import { useLanguage } from "@/lib/i18n";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLanguage();

  return (
    <div className={`rr-lang-switcher ${className}`} role="group" aria-label="Language selection">
      <button
        type="button"
        className={`rr-lang-btn ${lang === "en" ? "is-active" : ""}`}
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
      <button
        type="button"
        className={`rr-lang-btn ${lang === "hi" ? "is-active" : ""}`}
        onClick={() => setLang("hi")}
        aria-pressed={lang === "hi"}
      >
        हिन्दी
      </button>
    </div>
  );
}
