import { useEffect } from "react";
import "../styles/BootSplash.css";

export function BootSplash({
  logoSrc,
  title = "SVG Designer Studio",
  theme = "dark",
  duration = 3600,
  onDone,
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(timer);
  }, [duration, onDone]);

  const words = title.trim().split(/\s+/).filter(Boolean);

  return (
    <div className={`boot-splash boot-splash--${theme === "light" ? "light" : "dark"}`} role="status" aria-label={`${title} is starting`}>
      <div className="boot-splash__stage">
        <img className="boot-splash__logo" src={logoSrc} alt="" aria-hidden="true" />
        <div className="boot-splash__title" aria-label={title}>
          {words.map((word, i) => (
            <span
              key={`${word}-${i}`}
              className="boot-splash__word"
              style={{ "--i": i }}
              aria-hidden="true"
            >
              {word}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
