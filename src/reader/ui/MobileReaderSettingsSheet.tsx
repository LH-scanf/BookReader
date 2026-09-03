import { X } from "lucide-react";
import type { ReaderTheme } from "../../types";

type MobileReaderSettingsSheetProps = {
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  readerTheme: ReaderTheme;
  onFontSizeChange: (fontSize: number) => void;
  onThemeChange: (theme: ReaderTheme) => void;
  onClose: () => void;
};

export function adjustReaderFontSize(fontSize: number, delta: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, fontSize + delta));
}

export function MobileReaderSettingsSheet({ fontSize, minFontSize, maxFontSize, readerTheme, onFontSizeChange, onThemeChange, onClose }: MobileReaderSettingsSheetProps) {
  return <div className="mobile-reader-settings-layer" role="presentation">
    <button className="mobile-reader-settings-backdrop" aria-label="关闭阅读设置" onClick={onClose} />
    <section className="mobile-reader-settings-sheet" role="dialog" aria-modal="true" aria-label="阅读设置">
      <header className="mobile-reader-settings-header"><strong>阅读设置</strong><button aria-label="关闭阅读设置" onClick={onClose}><X size={20} /></button></header>
      <section className="mobile-reader-setting-group" aria-label="字号">
        <span>字号</span>
        <div className="mobile-reader-font-size-control">
          <button aria-label="减小字号" disabled={fontSize <= minFontSize} onClick={() => onFontSizeChange(adjustReaderFontSize(fontSize, -1, minFontSize, maxFontSize))}>A−</button>
          <input aria-label="字号" type="range" min={minFontSize} max={maxFontSize} value={fontSize} onChange={(event) => onFontSizeChange(Number(event.target.value))} />
          <button aria-label="增大字号" disabled={fontSize >= maxFontSize} onClick={() => onFontSizeChange(adjustReaderFontSize(fontSize, 1, minFontSize, maxFontSize))}>A+</button>
        </div>
        <p>清晨翻开一页书，看看此字号是否舒适。</p>
      </section>
      <section className="mobile-reader-setting-group" aria-label="阅读主题">
        <span>阅读主题</span>
        <div className="mobile-reader-theme-options">
          {(["light", "paper", "dark"] as const).map((theme) => <button key={theme} className={`mobile-reader-theme-${theme}`} aria-pressed={readerTheme === theme} onClick={() => onThemeChange(theme)}>{theme === "light" ? "明亮" : theme === "paper" ? "纸张" : "夜间"}</button>)}
        </div>
      </section>
    </section>
  </div>;
}
